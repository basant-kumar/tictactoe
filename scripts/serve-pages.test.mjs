import { strict as assert } from 'node:assert';
import { request } from 'node:http';
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';

import { createPagesServer } from './serve-pages.mjs';

function listen(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('The test server did not expose a loopback address.'));
        return;
      }
      resolve(address.port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function requestPage(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const responseBody = [];
    const clientRequest = request(
      {
        hostname: '127.0.0.1',
        method,
        path,
        port,
      },
      (response) => {
        response.on('data', (chunk) => responseBody.push(chunk));
        response.on('end', () => {
          resolve({
            body: Buffer.concat(responseBody),
            headers: response.headers,
            statusCode: response.statusCode,
          });
        });
      },
    );
    clientRequest.on('error', reject);
    clientRequest.end();
  });
}

test('Pages server serves assets and a real fallback without exposing siblings', async () => {
  const fixtureParent = await mkdtemp(join(tmpdir(), 'tictactoe-pages-parent-'));
  const rootDir = join(fixtureParent, 'dist');
  const siblingDir = join(fixtureParent, 'sibling');
  const server = createPagesServer({ rootDir });

  try {
    await mkdir(rootDir);
    await mkdir(siblingDir);
    await writeFile(join(rootDir, 'index.html'), '<main>game</main>');
    await writeFile(join(rootDir, '404.html'), '<main>fallback</main>');
    await writeFile(join(rootDir, '.nojekyll'), '');
    await writeFile(join(rootDir, 'styles.css'), 'body { color: red; }');
    await writeFile(join(siblingDir, 'secret.txt'), 'sibling secret');

    const port = await listen(server);

    const rootResponse = await requestPage(port, '/tictactoe/');
    assert.equal(rootResponse.statusCode, 200);
    assert.equal(rootResponse.body.toString(), '<main>game</main>');
    assert.match(rootResponse.headers['content-type'], /^text\/html/);

    const assetResponse = await requestPage(port, '/tictactoe/styles.css');
    assert.equal(assetResponse.statusCode, 200);
    assert.equal(assetResponse.body.toString(), 'body { color: red; }');
    assert.match(assetResponse.headers['content-type'], /^text\/css/);

    const missingResponse = await requestPage(port, '/tictactoe/missing/nested');
    assert.equal(missingResponse.statusCode, 404);
    assert.equal(missingResponse.body.toString(), '<main>fallback</main>');
    assert.match(missingResponse.headers['content-type'], /^text\/html/);

    const outsideResponse = await requestPage(port, '/other/path');
    assert.equal(outsideResponse.statusCode, 404);
    assert.equal(outsideResponse.body.toString(), 'Not Found\n');
    assert.match(outsideResponse.headers['content-type'], /^text\/plain/);

    const redirectResponse = await requestPage(port, '/tictactoe');
    assert.equal(redirectResponse.statusCode, 301);
    assert.equal(redirectResponse.headers.location, '/tictactoe/');

    const headResponse = await requestPage(port, '/tictactoe/', 'HEAD');
    assert.equal(headResponse.statusCode, 200);
    assert.equal(headResponse.body.byteLength, 0);

    const methodResponse = await requestPage(port, '/tictactoe/', 'POST');
    assert.equal(methodResponse.statusCode, 405);
    assert.equal(methodResponse.headers.allow, 'GET, HEAD');

    const siblingName = basename(siblingDir);
    for (const traversalPath of [
      `/tictactoe/../${siblingName}/secret.txt`,
      `/tictactoe/%2e%2e%2f${siblingName}/secret.txt`,
      `/tictactoe/%5c..%5c${siblingName}%5csecret.txt`,
      '/tictactoe/%ZZ',
    ]) {
      const traversalResponse = await requestPage(port, traversalPath);
      assert.equal(traversalResponse.statusCode, 404);
      assert.equal(traversalResponse.body.includes('sibling secret'), false);
    }
  } finally {
    await close(server);
    await rm(fixtureParent, { recursive: true, force: true });
  }
});
