import { build } from 'esbuild';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const outdir = resolve(root, 'web/dist');
await mkdir(outdir, { recursive: true });
const result = await build({
  absWorkingDir: root,
  entryPoints: ['web/app.ts'],
  outfile: resolve(outdir, 'app.js'),
  platform: 'browser', format: 'iife', target: ['es2022'], bundle: true,
  minify: true, legalComments: 'eof', metafile: true
});
await Promise.all([
  copyFile(resolve(root, 'web/index.html'), resolve(outdir, 'index.html')),
  copyFile(resolve(root, 'web/style.css'), resolve(outdir, 'style.css')),
  writeFile(resolve(outdir, 'build-meta.json'), JSON.stringify(result.metafile, null, 2) + '\n'),
  writeFile(resolve(outdir, 'THIRD_PARTY_NOTICES.txt'), 'This browser bundle includes @noble/hashes 2.4.0.\n\n' + await readFile(resolve(root, 'node_modules/@noble/hashes/LICENSE'), 'utf8'))
]);
console.log('Built web/dist/ — static files, relative assets, no runtime API.');
