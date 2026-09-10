import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MOUNT_PATH = '/tictactoe/';
const REQUIRED_OUTPUT_FILES = ['index.html', '404.html', '.nojekyll'];
const HEX_DIGIT = /^[0-9a-fA-F]$/;

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.json', 'application/json'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function contentTypeFor(filePath) {
  return MIME_TYPES.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream';
}

function sendResponse(response, method, statusCode, contentType, body) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  response.statusCode = statusCode;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Length', payload.byteLength);
  if (method === 'HEAD') {
    response.end();
    return;
  }
  response.end(payload);
}

function sendPlain404(response, method) {
  sendResponse(response, method, 404, 'text/plain; charset=utf-8', 'Not Found\n');
}

function sendInternalError(response, method) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  sendResponse(
    response,
    method,
    500,
    'text/plain; charset=utf-8',
    'Internal Server Error\n',
  );
}

function getRawPath(requestUrl) {
  if (typeof requestUrl !== 'string' || requestUrl.length === 0) {
    return null;
  }

  const queryStart = requestUrl.search(/[?#]/);
  return queryStart === -1 ? requestUrl : requestUrl.slice(0, queryStart);
}

function decodeRequestPath(rawPath) {
  if (
    !rawPath.startsWith('/') ||
    rawPath.includes('\\') ||
    rawPath.includes('\u0000')
  ) {
    return null;
  }

  for (let index = 0; index < rawPath.length; index += 1) {
    if (rawPath[index] !== '%') {
      continue;
    }
    if (
      index + 2 >= rawPath.length ||
      !HEX_DIGIT.test(rawPath[index + 1]) ||
      !HEX_DIGIT.test(rawPath[index + 2])
    ) {
      return null;
    }
    index += 2;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return null;
  }

  if (
    decodedPath.includes('\\') ||
    decodedPath.includes('\u0000') ||
    decodedPath.split('/').some((segment) => segment === '..')
  ) {
    return null;
  }

  return decodedPath;
}

function resolveMountedPath(rootDir, pathname) {
  const requestedPath = pathname.slice(MOUNT_PATH.length);
  if (requestedPath.startsWith('/')) {
    return null;
  }

  const candidatePath = resolve(rootDir, requestedPath);
  const relativePath = relative(rootDir, candidatePath);
  if (
    isAbsolute(relativePath) ||
    relativePath === '..' ||
    relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  ) {
    return null;
  }
  return candidatePath;
}

async function readRegularFile(filePath) {
  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      return null;
    }
    return await readFile(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function readRequiredFile(filePath) {
  const body = await readRegularFile(filePath);
  if (body === null) {
    throw new Error('Required static output is unavailable.');
  }
  return body;
}

async function serveMountedRequest(request, response, rootDir, pathname) {
  const method = request.method ?? 'GET';

  if (pathname === MOUNT_PATH.slice(0, -1)) {
    response.statusCode = 301;
    response.setHeader('Location', MOUNT_PATH);
    sendResponse(response, method, 301, 'text/plain; charset=utf-8', 'Moved Permanently\n');
    return;
  }

  if (pathname === MOUNT_PATH) {
    const body = await readRequiredFile(join(rootDir, 'index.html'));
    sendResponse(response, method, 200, 'text/html; charset=utf-8', body);
    return;
  }

  const candidatePath = resolveMountedPath(rootDir, pathname);
  if (candidatePath === null) {
    sendPlain404(response, method);
    return;
  }

  const body = await readRegularFile(candidatePath);
  if (body !== null) {
    sendResponse(response, method, 200, contentTypeFor(candidatePath), body);
    return;
  }

  const fallbackBody = await readRequiredFile(join(rootDir, '404.html'));
  sendResponse(response, method, 404, 'text/html; charset=utf-8', fallbackBody);
}

async function handleRequest(request, response, rootDir) {
  const method = request.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    sendResponse(
      response,
      method,
      405,
      'text/plain; charset=utf-8',
      'Method Not Allowed\n',
    );
    return;
  }

  const rawPath = getRawPath(request.url);
  const pathname = rawPath === null ? null : decodeRequestPath(rawPath);
  if (pathname === null) {
    sendPlain404(response, method);
    return;
  }

  if (!pathname.startsWith(MOUNT_PATH) && pathname !== MOUNT_PATH.slice(0, -1)) {
    sendPlain404(response, method);
    return;
  }

  await serveMountedRequest(request, response, rootDir, pathname);
}

export function createPagesServer({ rootDir }) {
  if (typeof rootDir !== 'string' || rootDir.length === 0) {
    throw new TypeError('rootDir must be a non-empty string.');
  }

  const absoluteRootDir = resolve(rootDir);
  return createServer((request, response) => {
    void handleRequest(request, response, absoluteRootDir).catch(() => {
      sendInternalError(response, request.method ?? 'GET');
    });
  });
}

function parseCliArgs(args) {
  const options = {
    dir: 'dist',
    host: '127.0.0.1',
    port: 4173,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const separatorIndex = argument.indexOf('=');
    const flag = separatorIndex === -1 ? argument : argument.slice(0, separatorIndex);
    let value = separatorIndex === -1 ? undefined : argument.slice(separatorIndex + 1);

    if (value === undefined && (flag === '--dir' || flag === '--host' || flag === '--port')) {
      value = args[index + 1];
      index += 1;
    }

    if (flag === '--dir') {
      if (!value) {
        throw new Error('--dir requires a value.');
      }
      options.dir = value;
    } else if (flag === '--host') {
      if (!value) {
        throw new Error('--host requires a value.');
      }
      options.host = value;
    } else if (flag === '--port') {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('--port must be an integer from 1 to 65535.');
      }
      options.port = port;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

async function requirePagesOutput(rootDir) {
  for (const fileName of REQUIRED_OUTPUT_FILES) {
    const filePath = join(rootDir, fileName);
    try {
      const fileStats = await stat(filePath);
      if (!fileStats.isFile()) {
        throw new Error(`Pages output is missing ${fileName}.`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Pages output is missing')) {
        throw error;
      }
      throw new Error(`Pages output is missing ${fileName}.`);
    }
  }
}

async function runCli() {
  const options = parseCliArgs(process.argv.slice(2));
  const rootDir = resolve(options.dir);
  await requirePagesOutput(rootDir);

  const server = createPagesServer({ rootDir });
  await new Promise((resolveListening, rejectListening) => {
    const handleError = (error) => {
      server.off('error', handleError);
      if (error && typeof error === 'object' && error.code === 'EADDRINUSE') {
        rejectListening(new Error('The requested port is already in use.'));
        return;
      }
      rejectListening(new Error('Unable to start the Pages fallback server.'));
    };
    server.once('error', handleError);
    server.listen(options.port, options.host, () => {
      server.off('error', handleError);
      resolveListening();
    });
  });

  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : options.port;
  const displayHost = options.host.includes(':') ? `[${options.host}]` : options.host;
  console.log(`Pages fallback server ready at http://${displayHost}:${port}${MOUNT_PATH}`);

  await new Promise((resolveClosed) => {
    let closing = false;
    const closeServer = () => {
      if (closing) {
        return;
      }
      closing = true;
      server.close(() => resolveClosed());
    };
    process.once('SIGINT', closeServer);
    process.once('SIGTERM', closeServer);
  });
}

const isMainModule =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMainModule) {
  try {
    await runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Unable to start Pages fallback server: ${message}`);
    process.exitCode = 1;
  }
}
