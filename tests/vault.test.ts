import { describe, it, expect } from 'vitest';
import { packFile, unpackFile } from '../src/vault/format.js';

describe('vault format', () => {
  it('round-trips header fields and ciphertext', () => {
    const salt = Buffer.alloc(16, 2);
    const iv = Buffer.alloc(12, 4);
    const ct = Buffer.from('cipherdata');
    const blob = packFile(salt, iv, ct);
    const parsed = unpackFile(blob);
    expect(parsed.salt.equals(salt)).toBe(true);
    expect(parsed.iv.equals(iv)).toBe(true);
    expect(parsed.ciphertext.equals(ct)).toBe(true);
  });

  it('rejects bad magic', () => {
    const bad = Buffer.alloc(50);
    bad.write('XXXX', 0, 'ascii');
    expect(() => unpackFile(bad)).toThrow(/magic/i);
  });

  it('rejects unsupported version', () => {
    const salt = Buffer.alloc(16, 2);
    const iv = Buffer.alloc(12, 4);
    const ct = Buffer.from('x');
    const blob = packFile(salt, iv, ct);
    blob[4] = 0x99;
    expect(() => unpackFile(blob)).toThrow(/version/i);
  });
});
