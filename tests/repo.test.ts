import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Vault } from '../src/vault/vault.js';
import { HostRepo } from '../src/hosts/repo.js';
import { EMPTY_VAULT, VaultData } from '../src/hosts/types.js';

async function freshRepo() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sshm-'));
  const file = path.join(dir, 'vault.enc');
  const v = await Vault.create<VaultData>(file, 'pw', EMPTY_VAULT);
  const repo = new HostRepo(v);
  return { dir, repo, vault: v };
}

const sample = {
  alias: 'prod-1',
  host: '10.0.0.5',
  port: 22,
  user: 'deploy',
  password: 's3cret',
  note: '',
};

describe('HostRepo', () => {
  it('starts empty', async () => {
    const { dir, repo } = await freshRepo();
    try {
      expect(repo.list()).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('adds, gets, lists hosts', async () => {
    const { dir, repo } = await freshRepo();
    try {
      const added = await repo.add(sample);
      expect(added.id).toMatch(/^h_/);
      expect(repo.list().length).toBe(1);
      expect(repo.get(added.id)?.alias).toBe('prod-1');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects duplicate alias on add', async () => {
    const { dir, repo } = await freshRepo();
    try {
      await repo.add(sample);
      await expect(repo.add(sample)).rejects.toThrow(/alias/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('updates an existing host', async () => {
    const { dir, repo } = await freshRepo();
    try {
      const a = await repo.add(sample);
      const updated = await repo.update(a.id, { user: 'root' });
      expect(updated.user).toBe('root');
      expect(updated.updatedAt).not.toBe(a.updatedAt);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects update that would create duplicate alias', async () => {
    const { dir, repo } = await freshRepo();
    try {
      const a = await repo.add(sample);
      const b = await repo.add({ ...sample, alias: 'prod-2' });
      await expect(repo.update(b.id, { alias: a.alias })).rejects.toThrow(/alias/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('removes a host', async () => {
    const { dir, repo } = await freshRepo();
    try {
      const a = await repo.add(sample);
      await repo.remove(a.id);
      expect(repo.list()).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('persists changes through vault.save()', async () => {
    const { dir, repo, vault } = await freshRepo();
    try {
      await repo.add(sample);
      const reloaded = await Vault.unlock<VaultData>((vault as any).file ?? path.join(dir, 'vault.enc'), 'pw');
      // file path used by Vault is private; reconstruct from dir:
      const v2 = await Vault.unlock<VaultData>(path.join(dir, 'vault.enc'), 'pw');
      expect(v2.data.hosts.length).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
