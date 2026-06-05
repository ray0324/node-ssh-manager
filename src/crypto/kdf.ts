import { scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  const key = await scryptAsync(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return key as Buffer;
}
