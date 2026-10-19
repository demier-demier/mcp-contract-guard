import { compare, createBaseline, loadBaseline, snapshot, type Report } from '../src/core.js';
import { InputError, isObject, LIMITS, parseJson } from '../src/parse.js';
export { sarif } from '../src/sarif.js';

export interface ComparisonInput {
  baseline: string;
  candidate: string;
  scope: string;
  acknowledged: boolean;
  includeValues: boolean;
}

/** Real shared-core comparison. No fixture result, ranking, or finding is substituted. */
export function compareInputs(input: ComparisonInput): Report {
  if (!input.acknowledged) throw new InputError('Confirm that the left export is the review reference for this comparison.');
  let baseline;
  try {
    const value = parseJson(input.baseline);
    baseline = isObject(value) && value.format === 'mcp-contract-guard/baseline-v1'
      ? loadBaseline(value, input.scope)
      : createBaseline(value, input.scope);
  } catch (error) { throw new InputError('Baseline: ' + (error instanceof Error ? error.message : 'invalid input')); }
  let candidate;
  try { candidate = snapshot(parseJson(input.candidate)); }
  catch (error) { throw new InputError('Candidate: ' + (error instanceof Error ? error.message : 'invalid input')); }
  return compare(baseline, candidate, input.includeValues ? 'none' : 'values');
}

export interface LocalFile { size: number; arrayBuffer(): Promise<ArrayBuffer> }
export async function readLocalFile(file: LocalFile): Promise<string> {
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > LIMITS.bytes) throw new InputError('Each file must be at most 2 MiB.');
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > LIMITS.bytes) throw new InputError('Each file must be at most 2 MiB.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new InputError('File is not valid UTF-8. No text was substituted.'); }
}

export const inputBytes = (text: string): number => new TextEncoder().encode(text).length;
