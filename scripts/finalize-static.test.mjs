import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { finalizeStatic } from './finalize-static.mjs';

async function createOutputFixture() {
  const outputDir = await mkdtemp(join(tmpdir(), 'tictactoe-static-'));
  await writeFile(join(outputDir, 'index.html'), '<html>first</html>');
  return outputDir;
}

test('finalizeStatic copies index.html exactly and is repeatable', async () => {
  const outputDir = await createOutputFixture();

  try {
    await writeFile(join(outputDir, '404.html'), 'stale fallback');
    await writeFile(join(outputDir, '.nojekyll'), 'stale marker');

    await finalizeStatic(outputDir);

    assert.equal(
      await readFile(join(outputDir, '404.html'), 'utf8'),
      '<html>first</html>',
    );
    assert.equal(await readFile(join(outputDir, '.nojekyll'), 'utf8'), '');

    await writeFile(join(outputDir, 'index.html'), '<html>second</html>');
    await finalizeStatic(outputDir);

    assert.equal(
      await readFile(join(outputDir, '404.html'), 'utf8'),
      '<html>second</html>',
    );
    assert.equal(await readFile(join(outputDir, '.nojekyll'), 'utf8'), '');
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('finalizeStatic rejects an output directory without index.html', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'tictactoe-static-missing-'));

  try {
    await writeFile(join(outputDir, '404.html'), 'stale fallback');
    await assert.rejects(() => finalizeStatic(outputDir));
    assert.equal(await readFile(join(outputDir, '404.html'), 'utf8'), 'stale fallback');
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
