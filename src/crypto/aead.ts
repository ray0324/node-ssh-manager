import { createCipheriv, createDecipheriv } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const TAG_LEN = 16;

// Returns ciphertext with 16-byte GCM tag appended.
export function encrypt(key: Buffer, iv: Buffer, plaintext: Buffer): Buffer {
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([enc, cipher.getAuthTag()]);
}

export function decrypt(key: Buffer, iv: Buffer, ciphertextWithTag: Buffer): Buffer {
  if (ciphertextWithTag.length < TAG_LEN) throw new Error('ciphertext too short');
  const ct = ciphertextWithTag.subarray(0, ciphertextWithTag.length - TAG_LEN);
  const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}
