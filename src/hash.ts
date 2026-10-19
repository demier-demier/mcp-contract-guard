import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/** One SHA-256 implementation for CLI and browser; identical canonical input bytes. */
export function sha256Text(text: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(text)));
}
