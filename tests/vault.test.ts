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

import { Vault } from '../src/vault/vault.js';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function tmpFile() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sshm-'));
  return { dir, file: path.join(dir, 'vault.enc') };
}

describe('Vault', () => {
  it('creates a new vault and reloads its contents with the same password', async () => {
    const { dir, file } = await tmpFile();
    try {
      const v1 = await Vault.create(file, 'hunter2', { foo: 'bar' });
      expect(v1.data).toEqual({ foo: 'bar' });

      const v2 = await Vault.unlock(file, 'hunter2');
      expect(v2.data).toEqual({ foo: 'bar' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects wrong password', async () => {
    const { dir, file } = await tmpFile();
    try {
      await Vault.create(file, 'right', { x: 1 });
      await expect(Vault.unlock(file, 'wrong')).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('persists updates via save()', async () => {
    const { dir, file } = await tmpFile();
    try {
      const v = await Vault.create<{ count: number }>(file, 'pw', { count: 0 });
      v.data.count = 5;
      await v.save();
      const reloaded = await Vault.unlock<{ count: number }>(file, 'pw');
      expect(reloaded.data.count).toBe(5);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes file with 0600 permissions', async () => {
    const { dir, file } = await tmpFile();
    try {
      await Vault.create(file, 'pw', {});
      const s = await stat(file);
      // mask to permission bits
      expect(s.mode & 0o777).toBe(0o600);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws on missing file via unlock', async () => {
    const { dir, file } = await tmpFile();
    try {
      await expect(Vault.unlock(file, 'pw')).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws on corrupted file', async () => {
    const { dir, file } = await tmpFile();
    try {
      await writeFile(file, Buffer.from('not-a-vault'));
      await expect(Vault.unlock(file, 'pw')).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('Vault.changePassword', () => {
  it('rejects a wrong current password and leaves the file unchanged', async () => {
    const { dir, file } = await tmpFile();
    try {
      const vault = await Vault.create(file, 'old-pass', { n: 1 });
      await expect(vault.changePassword('nope', 'new-pass')).rejects.toThrow(
        /current password is incorrect/,
      );
      const reloaded = await Vault.unlock<{ n: number }>(file, 'old-pass');
      expect(reloaded.data).toEqual({ n: 1 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('re-encrypts so only the new password unlocks the same data', async () => {
    const { dir, file } = await tmpFile();
    try {
      const vault = await Vault.create(file, 'old-pass', { n: 7 });
      await vault.changePassword('old-pass', 'new-pass');
      await expect(Vault.unlock(file, 'old-pass')).rejects.toThrow();
      const reloaded = await Vault.unlock<{ n: number }>(file, 'new-pass');
      expect(reloaded.data).toEqual({ n: 7 });
      vault.data = { n: 8 };
      await vault.save();
      const afterSave = await Vault.unlock<{ n: number }>(file, 'new-pass');
      expect(afterSave.data).toEqual({ n: 8 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a new password equal to the current password', async () => {
    const { dir, file } = await tmpFile();
    try {
      const vault = await Vault.create(file, 'same-pass', { n: 1 });
      await expect(vault.changePassword('same-pass', 'same-pass')).rejects.toThrow(
        /new password must differ from current password/,
      );
      const reloaded = await Vault.unlock<{ n: number }>(file, 'same-pass');
      expect(reloaded.data).toEqual({ n: 1 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps the old key when persist fails', async () => {
    const { dir, file } = await tmpFile();
    const blocker = `${file}.tmp`;
    try {
      const vault = await Vault.create(file, 'old-pass', { n: 1 });
      const { mkdir } = await import('node:fs/promises');
      await mkdir(blocker);
      await expect(vault.changePassword('old-pass', 'new-pass')).rejects.toThrow();
      const reloaded = await Vault.unlock<{ n: number }>(file, 'old-pass');
      expect(reloaded.data).toEqual({ n: 1 });
      await expect(Vault.unlock(file, 'new-pass')).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
