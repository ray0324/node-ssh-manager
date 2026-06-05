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

import { encrypt, decrypt } from '../src/crypto/aead.js';

describe('aead', () => {
  const key = Buffer.alloc(32, 9);
  const iv = Buffer.alloc(12, 3);
  const plaintext = Buffer.from('hello world', 'utf8');

  it('round-trips plaintext', () => {
    const ct = encrypt(key, iv, plaintext);
    const pt = decrypt(key, iv, ct);
    expect(pt.equals(plaintext)).toBe(true);
  });

  it('throws on tampered ciphertext', () => {
    const ct = encrypt(key, iv, plaintext);
    ct[0] ^= 0xff;
    expect(() => decrypt(key, iv, ct)).toThrow();
  });

  it('throws on wrong key', () => {
    const ct = encrypt(key, iv, plaintext);
    const wrong = Buffer.alloc(32, 8);
    expect(() => decrypt(wrong, iv, ct)).toThrow();
  });
});
