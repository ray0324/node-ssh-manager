const MAGIC = Buffer.from('SSHM', 'ascii');
const VERSION = 0x01;
const SALT_LEN = 16;
const IV_LEN = 12;
const HEADER_LEN = MAGIC.length + 1 + SALT_LEN + IV_LEN; // 4 + 1 + 16 + 12 = 33

export interface ParsedVaultFile {
  salt: Buffer;
  iv: Buffer;
  ciphertext: Buffer;
}

export function packFile(salt: Buffer, iv: Buffer, ciphertext: Buffer): Buffer {
  if (salt.length !== SALT_LEN) throw new Error('salt must be 16 bytes');
  if (iv.length !== IV_LEN) throw new Error('iv must be 12 bytes');
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, iv, ciphertext]);
}

export function unpackFile(blob: Buffer): ParsedVaultFile {
  if (blob.length < HEADER_LEN) throw new Error('vault file too short');
  if (!blob.subarray(0, 4).equals(MAGIC)) throw new Error('bad magic; not an sshm vault');
  const version = blob[4];
  if (version !== VERSION) throw new Error(`unsupported version: ${version}`);
  const salt = blob.subarray(5, 5 + SALT_LEN);
  const iv = blob.subarray(5 + SALT_LEN, 5 + SALT_LEN + IV_LEN);
  const ciphertext = blob.subarray(HEADER_LEN);
  return { salt, iv, ciphertext };
}
