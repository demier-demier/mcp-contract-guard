#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { readJson, InputError } from './parse.js';
import { compare, createBaseline, loadBaseline, snapshot } from './core.js';
import { html, sarif } from './report.js';

const help = `MCP Contract Guard 0.1.0 — offline tool contract review

  mcp-contract-guard baseline --input tools.json --scope local-test --reviewed --output baseline.json
  mcp-contract-guard compare --input current.json --baseline baseline.json --scope local-test
  mcp-contract-guard compare ... --format html --output review.html

Formats: json (default), sarif, html. Output defaults to stdout for compare.
--include-values exposes metadata values in evidence; default evidence is redacted.
--reviewed is your explicit acknowledgement of a human review; it is not a signature.
Outputs are created exclusively: existing files are never overwritten.
Exit 0: no contract change / baseline created. Exit 2: review required. Exit 1: invalid input or I/O.
Never connects to MCP servers or executes tools. Node.js 22+ required.
`;
async function main(): Promise<void> {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new InputError('Node.js 22 or later is required');
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help' || command === '-h' || command === undefined) { process.stdout.write(help); return; }
  if (command === '--version') { process.stdout.write('0.1.0\n'); return; }
  if (command !== 'baseline' && command !== 'compare') throw new InputError('Unknown command; use --help');
  const options = new Map<string, string>();
  const allowed = new Set(command === 'baseline' ? ['input', 'scope', 'reviewed', 'output'] : ['input', 'scope', 'baseline', 'format', 'output', 'include-values']);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!; const key = arg.slice(2);
    if (!arg.startsWith('--') || !allowed.has(key) || options.has(key)) throw new InputError('Unknown or duplicate option');
    if (key === 'reviewed' || key === 'include-values') options.set(key, 'true');
    else { const value = args[++i]; if (!value || value.startsWith('--')) throw new InputError('Option requires a value'); options.set(key, value); }
  }
  const required = (key: string): string => { const value = options.get(key); if (!value) throw new InputError('Missing --' + key); return value; };
  const scope = required('scope');
  const input = await readJson(required('input'));
  let output: string;
  if (command === 'baseline') {
    required('reviewed'); required('output');
    output = JSON.stringify(createBaseline(input, scope), null, 2) + '\n';
  } else {
    const report = compare(loadBaseline(await readJson(required('baseline')), scope), snapshot(input), options.has('include-values') ? 'none' : 'values');
    const format = options.get('format') ?? 'json';
    if (!['json', 'html', 'sarif'].includes(format)) throw new InputError('Format must be json, html, or sarif');
    output = format === 'html' ? html(report) : JSON.stringify(format === 'sarif' ? sarif(report) : report, null, 2) + '\n';
    process.exitCode = report.decision === 'review-required' ? 2 : 0;
  }
  const destination = options.get('output');
  if (destination) await writeFile(destination, output, { flag: 'wx', mode: 0o600 });
  else process.stdout.write(output);
}
main().catch((error: unknown) => {
  const detail = error instanceof InputError ? error.message : 'I/O failed' + (typeof error === 'object' && error !== null && 'code' in error ? ` (${String(error.code)})` : '');
  process.stderr.write(`mcp-contract-guard: ${detail}\n`); process.exitCode = 1;
});
