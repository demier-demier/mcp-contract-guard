export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Obj = { [key: string]: Json };
export const LIMITS = Object.freeze({ bytes: 2_097_152, depth: 32, nodes: 100_000, string: 32_768, key: 256, tools: 1_000, diffs: 2_000, advisories: 1_000 });
export class InputError extends Error { override name = 'InputError'; }
export const isObject = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
export function requireObject(v: Json | undefined, path: string): Obj {
  if (!isObject(v)) throw new InputError(`${path} must be an object`);
  return v;
}

/** Bounded JSON reader rejects ambiguous duplicate keys before JSON.parse can erase them. */
export function parseJson(source: string): Json {
  if (source.length > LIMITS.bytes || new TextEncoder().encode(source).length > LIMITS.bytes) throw new InputError('Input exceeds 2 MiB');
  let pos = 0, nodes = 0;
  const fail = (message: string): never => { throw new InputError(`${message} at offset ${pos}`); };
  const ws = () => { while (/\s/.test(source[pos] ?? '') && /[ \t\r\n]/.test(source[pos] ?? '')) pos++; };
  function string(): string {
    const start = pos++;
    while (pos < source.length) {
      const ch = source[pos++];
      if (ch === '"') {
        let v: string;
        try { v = JSON.parse(source.slice(start, pos)) as string; } catch { return fail('Invalid string'); }
        if (v.length > LIMITS.string) fail('String exceeds limit');
        // Reject lone surrogates: they cannot round-trip safely through UTF-8.
        for (let i = 0; i < v.length; i++) {
          const c = v.charCodeAt(i);
          if (c >= 0xd800 && c <= 0xdbff) { const d = v.charCodeAt(++i); if (!(d >= 0xdc00 && d <= 0xdfff)) fail('Unpaired surrogate'); }
          else if (c >= 0xdc00 && c <= 0xdfff) fail('Unpaired surrogate');
        }
        return v;
      }
      if (ch === '\\') pos++;
    }
    return fail('Unterminated string');
  }
  function value(depth: number): Json {
    if (++nodes > LIMITS.nodes) fail('Node count exceeds limit');
    if (depth > LIMITS.depth) fail('Nesting exceeds limit');
    ws(); const ch = source[pos];
    if (ch === '"') return string();
    if (ch === '{') {
      pos++; ws(); const out: Obj = Object.create(null) as Obj;
      if (source[pos] === '}') { pos++; return out; }
      while (true) {
        ws(); if (source[pos] !== '"') fail('Expected object key');
        const key = string();
        if (key.length > LIMITS.key) fail('Object key exceeds limit');
        if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('Forbidden object key');
        if (Object.hasOwn(out, key)) fail('Duplicate object key');
        ws(); if (source[pos++] !== ':') fail('Expected colon');
        out[key] = value(depth + 1); ws(); const sep = source[pos++];
        if (sep === '}') return out;
        if (sep !== ',') fail('Expected comma');
      }
    }
    if (ch === '[') {
      pos++; ws(); const out: Json[] = [];
      if (source[pos] === ']') { pos++; return out; }
      while (true) { out.push(value(depth + 1)); ws(); const sep = source[pos++]; if (sep === ']') return out; if (sep !== ',') fail('Expected comma'); }
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]] as const) {
      if (source.startsWith(literal, pos)) { pos += literal.length; return result; }
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(pos));
    if (!match) return fail('Expected JSON value');
    pos += match[0].length; const n = Number(match[0]);
    if (!Number.isFinite(n) || (Number.isInteger(n) && !Number.isSafeInteger(n))) fail('Number outside supported range');
    const normalizedDecimal = (text: string): string => {
      const [base = '', exponent = '0'] = text.toLowerCase().split('e');
      const negative = base.startsWith('-'), unsigned = negative ? base.slice(1) : base;
      const parts = unsigned.split('.'); let digits = parts.join('').replace(/^0+/, '');
      if (!digits) return '0';
      let power = Number(exponent) - (parts[1]?.length ?? 0);
      while (digits.endsWith('0')) { digits = digits.slice(0, -1); power++; }
      return (negative ? '-' : '') + digits + 'e' + power;
    };
    if (normalizedDecimal(match[0]) !== normalizedDecimal(String(n))) fail('Number loses decimal precision');
    return n;
  }
  const result = value(0); ws(); if (pos !== source.length) fail('Trailing input'); return result;
}
