import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { InputError, LIMITS, parseJson, type Json } from './parse.js';

export async function readJson(path: string): Promise<Json> {
  // O_NONBLOCK prevents a named pipe from blocking before the regular-file check.
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > LIMITS.bytes) throw new InputError('Input must be a regular file of at most 2 MiB');
    // Bound the read itself, including files that grow after stat().
    const buffer = Buffer.alloc(LIMITS.bytes + 1); let count = 0;
    while (count < buffer.length) { const r = await file.read(buffer, count, buffer.length - count, null); if (!r.bytesRead) break; count += r.bytesRead; }
    if (count > LIMITS.bytes) throw new InputError('Input exceeds 2 MiB');
    let source: string;
    try { source = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, count)); }
    catch { throw new InputError('Input is not valid UTF-8'); }
    return parseJson(source);
  } finally { await file.close(); }
}
