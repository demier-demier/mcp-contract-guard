import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';
import { build } from 'esbuild';
import { compare, createBaseline, snapshot, parseJson, sarif, LIMITS } from '../dist/index.js';
import { sha256Text } from '../dist/hash.js';

// Execute the browser-targeted bundle in a sandbox with no Node globals, filesystem,
// network, or DOM. This verifies shared-core behavior; parent browser QA tests the UI.
const bundled = await build({ entryPoints: ['web/compare.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'Guard', write: false, metafile: true, target: 'es2022' });
const sandbox = createContext({ TextEncoder, TextDecoder, Uint8Array, ArrayBuffer });
runInContext(bundled.outputFiles[0].text, sandbox);
const guard = sandbox.Guard;
const plain = value => JSON.parse(JSON.stringify(value));
const baselineText = await readFile('fixtures/reviewed.json', 'utf8');
const candidateText = await readFile('fixtures/candidate.json', 'utf8');
const input = (patch = {}) => ({ baseline: baselineText, candidate: candidateText, scope: 'synthetic-catalog-demo', acknowledged: true, includeValues: false, ...patch });

test('browser SHA-256 matches Node crypto for standard, Unicode and bounded long text', () => {
  for (const text of ['', 'abc', 'Café 🔐\n台帳', 'x'.repeat(100_000)]) assert.equal(sha256Text(text), createHash('sha256').update(text).digest('hex'));
});
test('browser bundle imports shared comparison modules and no Node runtime modules', () => {
  for (const path of ['src/core.ts', 'src/parse.ts', 'src/hash.ts', 'src/sarif.ts']) assert.ok(Object.hasOwn(bundled.metafile.inputs, path), path);
  for (const path of Object.keys(bundled.metafile.inputs)) assert.ok(!['src/io.ts', 'src/cli.ts', 'src/report.ts'].includes(path), path);
  assert.equal(typeof sandbox.Buffer, 'undefined'); assert.equal(typeof sandbox.process, 'undefined'); assert.equal(typeof sandbox.fetch, 'undefined');
});
test('browser comparison and SARIF exactly match the CLI core for the real synthetic fixture', () => {
  const expected = compare(createBaseline(parseJson(baselineText), 'synthetic-catalog-demo'), snapshot(parseJson(candidateText)));
  const actual = guard.compareInputs(input());
  assert.deepEqual(plain(actual), expected); assert.deepEqual(plain(guard.sarif(actual)), sarif(expected));
  assert.equal(actual.decision, 'review-required'); assert.equal(actual.summary.changed, 4);
});
test('browser visible evidence is opt-in and matches CLI output including hostile metadata', () => {
  const value = JSON.parse(baselineText); value.tools[0].description = '</script><img src=x onerror=alert(1)>';
  const text = JSON.stringify(value);
  assert.ok(!JSON.stringify(guard.compareInputs(input({ candidate: text }))).includes('<img'));
  const expected = compare(createBaseline(parseJson(baselineText), 'synthetic-catalog-demo'), snapshot(parseJson(text)), 'none');
  assert.deepEqual(plain(guard.compareInputs(input({ candidate: text, includeValues: true }))), expected);
});
test('browser tool reordering yields no-change; unknown metadata and innocuous description changes require review', () => {
  const value = JSON.parse(baselineText); value.tools.reverse();
  assert.equal(guard.compareInputs(input({ candidate: JSON.stringify(value) })).decision, 'no-change');
  value.tools[0].description += ' More information.';
  const changed = guard.compareInputs(input({ candidate: JSON.stringify(value) }));
  assert.equal(changed.decision, 'review-required'); assert.equal(changed.summary.heuristics, 0);
});
test('browser acknowledgement and invalid baseline/candidate fail without a comparison verdict', () => {
  assert.throws(() => guard.compareInputs(input({ acknowledged: false })), /Confirm/);
  assert.throws(() => guard.compareInputs(input({ baseline: 'null' })), /Baseline:/);
  assert.throws(() => guard.compareInputs(input({ candidate: '{"tools":[],"tools":[]}' })), /Candidate: Duplicate/);
  assert.throws(() => guard.compareInputs(input({ candidate: '{"tools":[],"nextCursor":"more"}' })), /pagination/);
});
test('browser accepts an acknowledged CLI baseline and checks its scope and integrity', async () => {
  const baseline = await readFile('fixtures/baseline.json', 'utf8');
  assert.equal(guard.compareInputs(input({ baseline })).decision, 'review-required');
  assert.throws(() => guard.compareInputs(input({ baseline, scope: 'wrong-scope' })), /scope mismatch/);
  const altered = JSON.parse(baseline); altered.tools[0].description += ' changed';
  assert.throws(() => guard.compareInputs(input({ baseline: JSON.stringify(altered) })), /fingerprint/);
});
test('browser file decoder rejects invalid UTF-8 before text can be substituted', async () => {
  await assert.rejects(guard.readLocalFile({ size: 2, arrayBuffer: async () => Uint8Array.from([0xc3, 0x28]).buffer }), /UTF-8/);
  const bytes = new TextEncoder().encode(baselineText);
  assert.equal(await guard.readLocalFile({ size: bytes.byteLength, arrayBuffer: async () => bytes.buffer }), baselineText);
});
test('browser file bounds reject before reading and recheck returned bytes', async () => {
  let read = false;
  await assert.rejects(guard.readLocalFile({ size: LIMITS.bytes + 1, arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } }), /2 MiB/);
  assert.equal(read, false);
  await assert.rejects(guard.readLocalFile({ size: 1, arrayBuffer: async () => new ArrayBuffer(LIMITS.bytes + 1) }), /2 MiB/);
});
test('browser pasted-input limit counts UTF-8 bytes and preserves prototype-key rejection', () => {
  assert.throws(() => guard.compareInputs(input({ candidate: JSON.stringify('🔐'.repeat(530_000)) })), /2 MiB/);
  assert.throws(() => guard.compareInputs(input({ candidate: '{"tools":[],"__proto__":{}}' })), /Forbidden/);
});
test('complete web bundle has relative assets, inert DOM rendering, and no network-capable imports', async () => {
  const built = await build({ entryPoints: ['web/app.ts'], bundle: true, platform: 'browser', write: false, metafile: true, target: 'es2022' });
  const page = await readFile('web/index.html', 'utf8'), source = await readFile('web/app.ts', 'utf8');
  assert.ok(page.includes('href="./style.css"')); assert.ok(page.includes('src="./app.js"'));
  assert.ok(page.includes("connect-src 'none'")); assert.ok(page.includes('href="../"'));
  assert.ok(source.includes('.textContent')); assert.ok(!/\.innerHTML|\.outerHTML|insertAdjacentHTML|\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage/.test(source));
  assert.ok(built.outputFiles[0].contents.byteLength < 300_000);
  for (const output of Object.values(built.metafile.outputs)) assert.equal(output.imports.length, 0);
});
