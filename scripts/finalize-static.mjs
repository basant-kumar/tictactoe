import { access, copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function finalizeStatic(outDir) {
  const outputDir = resolve(outDir);
  const indexPath = resolve(outputDir, 'index.html');

  await access(indexPath);
  await copyFile(indexPath, resolve(outputDir, '404.html'));
  await writeFile(resolve(outputDir, '.nojekyll'), '', 'utf8');
}

const isMainModule =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMainModule) {
  try {
    await finalizeStatic('dist');
    console.log('Finalized static Pages output in dist.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Unable to finalize static Pages output: ${message}`);
    process.exitCode = 1;
  }
}
