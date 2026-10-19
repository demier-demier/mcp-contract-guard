import { createHash } from 'node:crypto';
import { InputError, isObject, requireObject, LIMITS, type Json, type Obj } from './parse.js';

export function canonical(value: Json): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (isObject(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k]!)).join(',') + '}';
  return JSON.stringify(value);
}
export const fingerprint = (value: Json): string => createHash('sha256').update(canonical(value)).digest('hex');
const ptr = (s: string) => s.replaceAll('~', '~0').replaceAll('/', '~1');
const types = new Set(['null', 'boolean', 'object', 'array', 'number', 'integer', 'string']);
const has = (v: Obj, k: string) => Object.hasOwn(v, k);
function error(path: string, message: string): never { throw new InputError(`${path}: ${message}`); }

/** Structural JSON Schema checks; no schema evaluation, reference resolution, or regex execution. */
function schema(v: Json, path: string, root = false): void {
  if (typeof v === 'boolean' && !root) return;
  const s = requireObject(v, path);
  if (has(s, '$schema') && s.$schema !== 'https://json-schema.org/draft/2020-12/schema') error(path, 'only JSON Schema 2020-12 is supported');
  for (const key of ['$id', '$ref', '$dynamicRef', '$anchor', '$dynamicAnchor', 'title', 'description', '$comment', 'format', 'pattern', 'contentEncoding', 'contentMediaType']) {
    if (has(s, key) && typeof s[key] !== 'string') error(path + '/' + key, 'must be a string');
  }
  if (has(s, 'type')) {
    const t = Array.isArray(s.type) ? s.type : [s.type];
    if (!t.length || new Set(t).size !== t.length || !t.every(x => typeof x === 'string' && types.has(x))) error(path + '/type', 'invalid type');
  }
  for (const key of ['required']) if (has(s, key)) {
    const a = s[key]; if (!Array.isArray(a) || !a.every(x => typeof x === 'string') || new Set(a).size !== a.length) error(path + '/' + key, 'must be unique strings');
  }
  if (has(s, 'enum')) {
    const a = s.enum; if (!Array.isArray(a) || !a.length || new Set(a.map(canonical)).size !== a.length) error(path + '/enum', 'must be a nonempty unique array');
  }
  for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties', 'minContains', 'maxContains']) {
    if (!has(s, key)) continue; const n = s[key];
    if (typeof n !== 'number' || !Number.isFinite(n)) error(path + '/' + key, 'must be finite number');
    if (key === 'multipleOf' && n <= 0) error(path + '/' + key, 'must be positive');
    if (!['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'].includes(key) && (!Number.isSafeInteger(n) || n < 0)) error(path + '/' + key, 'must be a nonnegative integer');
  }
  for (const key of ['uniqueItems', 'readOnly', 'writeOnly', 'deprecated']) if (has(s, key) && typeof s[key] !== 'boolean') error(path + '/' + key, 'must be boolean');
  if (has(s, 'examples') && !Array.isArray(s.examples)) error(path + '/examples', 'must be an array');
  for (const key of ['properties', 'patternProperties', '$defs', 'dependentSchemas']) if (has(s, key)) {
    for (const [name, child] of Object.entries(requireObject(s[key], path + '/' + key))) schema(child, path + '/' + key + '/' + ptr(name));
  }
  if (has(s, 'dependentRequired')) for (const [name, a] of Object.entries(requireObject(s.dependentRequired, path + '/dependentRequired'))) {
    if (!Array.isArray(a) || !a.every(x => typeof x === 'string') || new Set(a).size !== a.length) error(path + '/dependentRequired/' + ptr(name), 'must be unique strings');
  }
  if (has(s, '$vocabulary')) for (const value of Object.values(requireObject(s.$vocabulary, path + '/$vocabulary'))) if (typeof value !== 'boolean') error(path, '$vocabulary values must be boolean');
  for (const key of ['items', 'additionalProperties', 'unevaluatedProperties', 'unevaluatedItems', 'contains', 'not', 'if', 'then', 'else', 'propertyNames', 'contentSchema']) if (has(s, key)) schema(s[key]!, path + '/' + key);
  for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) if (has(s, key)) {
    const a = s[key]; if (!Array.isArray(a) || a.length === 0) error(path + '/' + key, 'must be a nonempty schema array');
    a.forEach((child, i) => schema(child, path + '/' + key + '/' + i));
  }
}

export interface Snapshot { tools: Obj[]; digest: string }
export function snapshot(input: Json): Snapshot {
  const envelope = requireObject(input, '/');
  if (has(envelope, 'error')) error('/', 'JSON-RPC errors are not snapshots');
  if (has(envelope, 'result') && has(envelope, 'tools')) error('/', 'ambiguous response envelope');
  if (has(envelope, 'jsonrpc') && envelope.jsonrpc !== '2.0') error('/jsonrpc', 'expected 2.0');
  const response = has(envelope, 'result') ? requireObject(envelope.result, '/result') : envelope;
  if (has(response, 'nextCursor')) error('/nextCursor', 'incomplete pagination; export all pages with the cursor removed');
  if (has(response, 'resultType') && response.resultType !== 'complete') error('/resultType', 'expected complete result');
  if (!Array.isArray(response.tools) || response.tools.length > LIMITS.tools) error('/tools', 'expected at most 1000 tools');
  const names = new Set<string>();
  const tools = response.tools.map((value, index) => {
    const p = '/tools/' + index, tool = requireObject(value, p);
    if (typeof tool.name !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(tool.name)) error(p + '/name', 'unsupported tool name');
    if (names.has(tool.name)) error(p + '/name', 'duplicate tool name'); names.add(tool.name);
    for (const key of ['description', 'title']) if (has(tool, key) && typeof tool[key] !== 'string') error(p + '/' + key, 'must be a string');
    schema(tool.inputSchema!, p + '/inputSchema', true);
    if (has(tool, 'outputSchema')) schema(tool.outputSchema!, p + '/outputSchema', true);
    if (has(tool, 'annotations')) {
      const a = requireObject(tool.annotations, p + '/annotations');
      for (const key of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']) if (has(a, key) && typeof a[key] !== 'boolean') error(p + '/annotations/' + key, 'must be boolean');
      if (has(a, 'title') && typeof a.title !== 'string') error(p + '/annotations/title', 'must be string');
    }
    if (has(tool, '_meta')) requireObject(tool._meta, p + '/_meta');
    if (has(tool, 'icons')) {
      if (!Array.isArray(tool.icons)) error(p + '/icons', 'must be array');
      tool.icons.forEach((v, i) => { const icon = requireObject(v, p + '/icons/' + i); if (typeof icon.src !== 'string') error(p + '/icons/' + i, 'src must be string'); });
    }
    return tool;
  }).sort((a, b) => (a.name as string) < (b.name as string) ? -1 : 1);
  return { tools, digest: fingerprint(tools) };
}
export interface Baseline { format: 'mcp-contract-guard/baseline-v1'; scope: string; review: 'explicit-acknowledgement'; digest: string; tools: Obj[] }
export function createBaseline(input: Json, scope: string): Baseline {
  if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(scope)) throw new InputError('Scope must be a stable non-secret identifier (1–120 characters)');
  const s = snapshot(input); return { format: 'mcp-contract-guard/baseline-v1', scope, review: 'explicit-acknowledgement', digest: s.digest, tools: s.tools };
}
export function loadBaseline(input: Json, scope: string): Baseline {
  const v = requireObject(input, '/baseline');
  if (v.format !== 'mcp-contract-guard/baseline-v1' || v.review !== 'explicit-acknowledgement') error('/baseline', 'not an acknowledged baseline');
  if (typeof v.scope !== 'string' || v.scope !== scope) error('/baseline/scope', 'scope mismatch');
  const b = createBaseline({ tools: v.tools! }, v.scope);
  if (v.digest !== b.digest) error('/baseline/digest', 'baseline contents do not match fingerprint');
  return b;
}

export interface Evidence { path: string; before?: Json; after?: Json; beforeHash?: string; afterHash?: string }
export interface Finding { ruleId: string; tool: string; path: string; kind: 'change' | 'heuristic' | 'surface'; message: string }
export interface ToolReview { name: string; status: 'added' | 'removed' | 'changed' | 'unchanged'; beforeHash?: string; afterHash?: string; schemaHash?: string; descriptionHash?: string; annotationHash?: string; changes: Evidence[]; truncated: boolean; findings: Finding[] }
export interface Report { format: 'mcp-contract-guard/report-v1'; scope: string; decision: 'review-required' | 'no-change'; redaction: 'values' | 'none'; baselineDigest: string; candidateDigest: string; advisoriesTruncated: boolean; summary: { added: number; removed: number; changed: number; unchanged: number; heuristics: number; surfaceSignals: number }; tools: ToolReview[] }
function evidence(value: Json | undefined, redaction: 'values' | 'none'): Json | undefined {
  if (value === undefined) return undefined;
  if (redaction === 'values') return '[value omitted; compare fingerprint]';
  const text = canonical(value); return text.length <= 600 ? value : text.slice(0, 600) + '… [preview truncated]';
}
function differences(a: Json | undefined, b: Json | undefined, path: string, mode: 'values' | 'none', output: Evidence[], budget: { remaining: number; truncated: boolean }): void {
  if (a !== undefined && b !== undefined && canonical(a) === canonical(b)) return;
  if (isObject(a) && isObject(b)) {
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) differences(a[key], b[key], path + '/' + ptr(key), mode, output, budget);
    return;
  }
  if (budget.remaining <= 0) { budget.truncated = true; return; }
  budget.remaining--;
  output.push({ path, ...(a === undefined ? {} : { before: evidence(a, mode), beforeHash: fingerprint(a) }), ...(b === undefined ? {} : { after: evidence(b, mode), afterHash: fingerprint(b) }) });
}
function inspectMetadata(tool: Obj, name: string, budget: { remaining: number; truncated: boolean }): Finding[] {
  const findings: Finding[] = [];
  const rules: [string, RegExp, string][] = [
    ['META001', /\b(ignore|override|disregard)\b.{0,70}\b(previous|system|developer|instructions|rules)\b/i, 'Instruction override language (heuristic; may be benign).'],
    ['META002', /\b(without|skip|bypass)\b.{0,50}\b(approval|consent|confirmation|permission)\b/i, 'Approval bypass language (heuristic; may be benign).'],
    ['META003', /\b(secret|credential|password|token)\b.{0,70}\b(send|upload|forward|transmit)\b|\b(send|upload|forward|transmit)\b.{0,70}\b(secret|credential|password|token)\b/i, 'Sensitive-data transfer language (heuristic; may be benign).'],
    ['META004', /[\u202a-\u202e\u2066-\u2069\u200b-\u200f\u{e0000}-\u{e007f}]/u, 'Invisible or directional formatting characters (heuristic; inspect source).']
  ];
  function walk(v: Json, path: string): void {
    if (typeof v === 'string') { for (const [ruleId, pattern, message] of rules) if (pattern.test(v)) { if (budget.remaining > 0) { budget.remaining--; findings.push({ ruleId, tool: name, path, kind: 'heuristic', message }); } else budget.truncated = true; } }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, path + '/' + i));
    else if (isObject(v)) for (const k of Object.keys(v).sort()) walk(v[k]!, path + '/' + ptr(k));
  }
  walk(tool, '/tools/' + ptr(name)); return findings;
}

/** Local signals only: a schema difference is not a proof of permission change. */
function surfaceSignals(oldTool: Obj, newTool: Obj, name: string, budget: { remaining: number; truncated: boolean }): Finding[] {
  const out: Finding[] = [], root = '/tools/' + ptr(name);
  const add = (path: string, message: string) => { if (budget.remaining > 0) { budget.remaining--; out.push({ ruleId: 'SURFACE001', tool: name, path, kind: 'surface' as const, message }); } else budget.truncated = true; };
  const a = isObject(oldTool.annotations) ? oldTool.annotations : {}, b = isObject(newTool.annotations) ? newTool.annotations : {};
  for (const [key, previous, riskier] of [['readOnlyHint', true, false], ['destructiveHint', false, true], ['openWorldHint', false, true]] as const) {
    if (a[key] === previous && b[key] !== previous) add(root + '/annotations/' + key, `${key} ${b[key] === riskier ? 'changed' : 'was removed'}: possible broader behavior. Annotations are untrusted hints.`);
  }
  function walk(x: Json | undefined, y: Json | undefined, path: string): void {
    if (!isObject(x) || !isObject(y)) return;
    if (x.additionalProperties === false && y.additionalProperties !== false) add(path + '/additionalProperties', 'Additional properties are no longer explicitly forbidden at this schema node.');
    if (Array.isArray(x.required)) { const currentRequired = new Set(Array.isArray(y.required) ? y.required : []); if (x.required.some(k => !currentRequired.has(k))) add(path + '/required', 'A required field was removed at this schema node; accepted inputs may expand.'); }
    if (Array.isArray(x.enum)) { const oldEnum = new Set(x.enum.map(canonical)); if (!Array.isArray(y.enum) || y.enum.some(v => !oldEnum.has(canonical(v)))) add(path + '/enum', 'An enum constraint was removed or gained values; accepted inputs may expand.'); }
    if (isObject(y.properties)) for (const key of Object.keys(y.properties).sort()) if (!isObject(x.properties) || !has(x.properties, key)) add(path + '/properties/' + ptr(key), 'A parameter was added; inspect the new input surface.');
    for (const key of Object.keys(y).sort()) if (has(x, key)) walk(x[key], y[key], path + '/' + ptr(key));
  }
  walk(oldTool.inputSchema, newTool.inputSchema, root + '/inputSchema'); return out;
}

export function compare(baseline: Baseline, candidate: Snapshot, redaction: 'values' | 'none' = 'values'): Report {
  const old = new Map(baseline.tools.map(t => [t.name as string, t])), current = new Map(candidate.tools.map(t => [t.name as string, t]));
  const budget = { remaining: LIMITS.diffs, truncated: false };
  const advisories = { remaining: LIMITS.advisories, truncated: false };
  const tools: ToolReview[] = [...new Set([...old.keys(), ...current.keys()])].sort().map(name => {
    const a = old.get(name), b = current.get(name), changes: Evidence[] = [];
    const beforeHash = a && fingerprint(a), afterHash = b && fingerprint(b);
    const status = !a ? 'added' : !b ? 'removed' : beforeHash !== afterHash ? 'changed' : 'unchanged';
    const localBudget = { remaining: budget.remaining, truncated: false };
    differences(a, b, '/tools/' + ptr(name), redaction, changes, localBudget); budget.remaining = localBudget.remaining;
    const findings = b ? inspectMetadata(b, name, advisories) : [];
    if (status !== 'unchanged') findings.unshift({ ruleId: 'CONTRACT001', tool: name, path: '/tools/' + ptr(name), kind: 'change', message: `Tool ${status}; explicit review required regardless of heuristic results.` });
    if (a && b) findings.push(...surfaceSignals(a, b, name, advisories));
    return { name, status, ...(beforeHash ? { beforeHash } : {}), ...(afterHash ? { afterHash } : {}), ...(b ? { schemaHash: fingerprint(b.inputSchema!), descriptionHash: fingerprint(b.description ?? null), annotationHash: fingerprint(b.annotations ?? null) } : {}), changes, truncated: localBudget.truncated, findings };
  });
  const summary = { added: 0, removed: 0, changed: 0, unchanged: 0, heuristics: 0, surfaceSignals: 0 };
  for (const t of tools) { summary[t.status]++; summary.heuristics += t.findings.filter(f => f.kind === 'heuristic').length; summary.surfaceSignals += t.findings.filter(f => f.kind === 'surface').length; }
  return { format: 'mcp-contract-guard/report-v1', scope: baseline.scope, decision: summary.added + summary.removed + summary.changed > 0 ? 'review-required' : 'no-change', redaction, baselineDigest: baseline.digest, candidateDigest: candidate.digest, advisoriesTruncated: advisories.truncated, summary, tools };
}
