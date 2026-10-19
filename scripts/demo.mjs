import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createBaseline, snapshot, compare, html, sarif, readJson } from '../dist/index.js';
const root = new URL('../', import.meta.url);
const baseline = createBaseline(await readJson(fileURLToPath(new URL('fixtures/reviewed.json', root))), 'synthetic-catalog-demo');
const report = compare(baseline, snapshot(await readJson(fileURLToPath(new URL('fixtures/candidate.json', root)))), 'none');
const artifacts = new Map([
  ['fixtures/baseline.json', JSON.stringify(baseline, null, 2) + '\n'],
  ['docs/results.json', JSON.stringify(report, null, 2) + '\n'],
  ['docs/results.sarif', JSON.stringify(sarif(report), null, 2) + '\n'],
  ['docs/demo.html', html(report)]
]);
for (const [name, text] of artifacts) {
  const target = new URL(name, root);
  if (process.argv.includes('--check')) { if (await readFile(target, 'utf8') !== text) throw new Error('Generated artifact drift: ' + name); }
  else await writeFile(target, text);
}
console.log(process.argv.includes('--check') ? 'Demo artifacts are deterministic and current.' : 'Wrote synthetic baseline and offline demo artifacts.');
