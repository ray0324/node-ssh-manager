import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { deriveKey } from '../crypto/kdf.js';
import { encrypt, decrypt } from '../crypto/aead.js';
import { packFile, unpackFile } from './format.js';

export class Vault<T = unknown> {
  private constructor(
    private readonly file: string,
    private readonly key: Buffer,
    private readonly salt: Buffer,
    public data: T,
  ) {}

  static async create<T>(file: string, password: string, initial: T): Promise<Vault<T>> {
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt);
    const cloned = JSON.parse(JSON.stringify(initial)) as T;
    const v = new Vault<T>(file, key, salt, cloned);
    await v.save();
    return v;
  }

  static async unlock<T>(file: string, password: string): Promise<Vault<T>> {
    const blob = await readFile(file);
    const { salt, iv, ciphertext } = unpackFile(blob);
    const key = await deriveKey(password, salt);
    const plaintext = decrypt(key, iv, ciphertext);
    const data = JSON.parse(plaintext.toString('utf8')) as T;
    return new Vault<T>(file, key, salt, data);
  }

  async save(): Promise<void> {
    const iv = randomBytes(12);
    const pt = Buffer.from(JSON.stringify(this.data), 'utf8');
    const ct = encrypt(this.key, iv, pt);
    const blob = packFile(this.salt, iv, ct);
    const tmp = `${this.file}.tmp`;
    const fh = await open(tmp, 'w', 0o600);
    try {
      await fh.writeFile(blob);
      await fh.sync();
    } finally {
      await fh.close();
    }
    await rename(tmp, this.file);
  }
}
