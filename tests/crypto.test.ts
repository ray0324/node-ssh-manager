import { describe, it, expect } from 'vitest';
import { deriveKey } from '../src/crypto/kdf.js';

describe('deriveKey', () => {
  it('returns a 32-byte key', async () => {
    const salt = Buffer.alloc(16, 1);
    const key = await deriveKey('hunter2', salt);
    expect(key.length).toBe(32);
  });

  it('is deterministic for same input', async () => {
    const salt = Buffer.alloc(16, 7);
    const a = await deriveKey('pw', salt);
    const b = await deriveKey('pw', salt);
    expect(a.equals(b)).toBe(true);
  });

  it('differs for different password', async () => {
    const salt = Buffer.alloc(16, 7);
    const a = await deriveKey('pw1', salt);
    const b = await deriveKey('pw2', salt);
    expect(a.equals(b)).toBe(false);
  });
});
