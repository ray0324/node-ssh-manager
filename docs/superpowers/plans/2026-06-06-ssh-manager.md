# SSH Manager (sshm) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-user local TUI SSH manager in Node.js + TypeScript that stores host credentials in a master-password-encrypted local vault and one-key connects via SSH (password auth only).

**Architecture:** Five strictly layered modules — `Crypto` (pure scrypt + AES-256-GCM), `Vault` (atomic encrypted file I/O), `HostRepo` (CRUD over decrypted JSON), `SshClient` (ssh2-based interactive shell bridge), `UI` (Ink/React TUI). UI uses Context to inject Repo/Vault, so every layer is independently testable with mocks.

**Tech Stack:** Node.js (>=20), TypeScript, Ink v5, React 18, ssh2, zod, nanoid, vitest, ink-testing-library.

Spec: `docs/superpowers/specs/2026-06-06-ssh-manager-design.md`

---

## File Structure

Files created during this plan, with their responsibilities:

| Path | Responsibility |
|---|---|
| `package.json` | Dependencies, scripts, `bin` entry |
| `tsconfig.json` | TS compiler config (NodeNext, JSX react-jsx, strict) |
| `vitest.config.ts` | Vitest config |
| `.gitignore` | Ignore `node_modules`, `dist`, `coverage` |
| `bin/sshm.js` | Node shebang loader for `dist/index.js` |
| `src/paths.ts` | Centralized `~/.sshm` paths (overridable for tests) |
| `src/crypto/kdf.ts` | scrypt key derivation (pure) |
| `src/crypto/aead.ts` | AES-256-GCM encrypt/decrypt primitives (pure) |
| `src/vault/format.ts` | Binary file header pack/unpack |
| `src/vault/vault.ts` | `Vault` class: unlock/save/lock + atomic write |
| `src/hosts/types.ts` | `Host` interface + zod schema |
| `src/hosts/repo.ts` | `HostRepo`: list/get/add/update/remove |
| `src/ssh/knownHosts.ts` | Read/write `known_hosts.json` |
| `src/ssh/client.ts` | `SshClient.connect()` interactive shell |
| `src/ui/context.tsx` | `VaultContext`, `RepoContext` |
| `src/ui/App.tsx` | Top-level router (Init / Unlock / Main) |
| `src/ui/screens/InitScreen.tsx` | First-run master password setup |
| `src/ui/screens/UnlockScreen.tsx` | Unlock prompt |
| `src/ui/screens/ListScreen.tsx` | Host list + key bindings |
| `src/ui/screens/HostFormScreen.tsx` | Add/edit form |
| `src/ui/components/HostList.tsx` | List rendering |
| `src/ui/components/Footer.tsx` | Key hints footer |
| `src/ui/components/ConfirmModal.tsx` | Delete confirmation |
| `src/index.tsx` | CLI entry: orchestrates Ink mount/unmount + SSH session |
| `tests/crypto.test.ts` | AEAD + KDF tests |
| `tests/vault.test.ts` | Vault round-trip, bad file, wrong password |
| `tests/repo.test.ts` | HostRepo CRUD + unique alias |
| `tests/ssh-client.test.ts` | SshClient against embedded `ssh2.Server` |
| `tests/ui/listScreen.test.tsx` | List rendering and keypress smoke test |

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `bin/sshm.js`

- [ ] **Step 1: Write `.gitignore`**

```
node_modules/
dist/
coverage/
*.log
.DS_Store
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "sshm",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "sshm": "bin/sshm.js" },
  "scripts": {
    "build": "tsc -p .",
    "dev": "tsx src/index.tsx",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "ink": "^5.0.1",
    "ink-select-input": "^6.0.0",
    "ink-text-input": "^6.0.0",
    "nanoid": "^5.0.7",
    "react": "^18.3.1",
    "ssh2": "^1.15.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.12.12",
    "@types/react": "^18.3.3",
    "@types/ssh2": "^1.15.0",
    "ink-testing-library": "^4.0.0",
    "tsx": "^4.11.0",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 10000,
  },
});
```

- [ ] **Step 5: Write `bin/sshm.js`**

```js
#!/usr/bin/env node
import('../dist/index.js');
```

Then make it executable:

Run: `chmod +x bin/sshm.js`

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: dependencies installed, no native-build errors (ssh2 is pure JS).

- [ ] **Step 7: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig.json vitest.config.ts bin/sshm.js
git commit -m "chore: scaffold sshm project (ts + ink + ssh2)"
```

---

## Task 2: Centralized paths module

**Files:**
- Create: `src/paths.ts`

- [ ] **Step 1: Write `src/paths.ts`**

```ts
import os from 'node:os';
import path from 'node:path';

export interface Paths {
  baseDir: string;
  vaultFile: string;
  knownHostsFile: string;
}

export function defaultPaths(homeDir: string = os.homedir()): Paths {
  const baseDir = path.join(homeDir, '.sshm');
  return {
    baseDir,
    vaultFile: path.join(baseDir, 'vault.enc'),
    knownHostsFile: path.join(baseDir, 'known_hosts.json'),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/paths.ts
git commit -m "feat(paths): centralize ~/.sshm paths"
```

---

## Task 3: Crypto primitives — KDF (TDD)

**Files:**
- Create: `tests/crypto.test.ts`
- Create: `src/crypto/kdf.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/crypto.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/crypto.test.ts`
Expected: FAIL with "Cannot find module '../src/crypto/kdf.js'"

- [ ] **Step 3: Write `src/crypto/kdf.ts`**

```ts
import { scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  const key = await scryptAsync(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return key as Buffer;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/crypto.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/crypto/kdf.ts tests/crypto.test.ts
git commit -m "feat(crypto): scrypt key derivation"
```

---

## Task 4: Crypto primitives — AEAD (TDD)

**Files:**
- Modify: `tests/crypto.test.ts`
- Create: `src/crypto/aead.ts`

- [ ] **Step 1: Append failing tests to `tests/crypto.test.ts`**

Append at end of file:

```ts
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
```

- [ ] **Step 2: Run tests to verify failures**

Run: `npx vitest run tests/crypto.test.ts`
Expected: FAIL with "Cannot find module '../src/crypto/aead.js'"

- [ ] **Step 3: Write `src/crypto/aead.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/crypto.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/crypto/aead.ts tests/crypto.test.ts
git commit -m "feat(crypto): AES-256-GCM encrypt/decrypt"
```

---

## Task 5: Vault file format (TDD)

**Files:**
- Create: `tests/vault.test.ts`
- Create: `src/vault/format.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/vault.test.ts
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
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/vault.test.ts`
Expected: FAIL "Cannot find module '../src/vault/format.js'"

- [ ] **Step 3: Write `src/vault/format.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/vault.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/vault/format.ts tests/vault.test.ts
git commit -m "feat(vault): binary file header format"
```

---

## Task 6: Vault class — create / unlock / save (TDD)

**Files:**
- Modify: `tests/vault.test.ts`
- Create: `src/vault/vault.ts`

- [ ] **Step 1: Append failing tests to `tests/vault.test.ts`**

Append at end of file:

```ts
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
```

- [ ] **Step 2: Run tests to verify failures**

Run: `npx vitest run tests/vault.test.ts`
Expected: FAIL "Cannot find module '../src/vault/vault.js'"

- [ ] **Step 3: Write `src/vault/vault.ts`**

```ts
import { mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises';
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
    const v = new Vault<T>(file, key, salt, initial);
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
    await writeFile(tmp, blob, { mode: 0o600 });
    await rename(tmp, this.file);
    await chmod(this.file, 0o600);
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/vault.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/vault/vault.ts tests/vault.test.ts
git commit -m "feat(vault): Vault create/unlock/save with atomic write"
```

---

## Task 7: Host types + zod schema

**Files:**
- Create: `src/hosts/types.ts`

- [ ] **Step 1: Write `src/hosts/types.ts`**

```ts
import { z } from 'zod';

export const HostInputSchema = z.object({
  alias: z.string().min(1).max(64),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(22),
  user: z.string().min(1).max(64),
  password: z.string().min(1),
  note: z.string().max(500).optional().default(''),
});

export type HostInput = z.input<typeof HostInputSchema>;

export interface Host {
  id: string;
  alias: string;
  host: string;
  port: number;
  user: string;
  password: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultData {
  schemaVersion: 1;
  hosts: Host[];
}

export const EMPTY_VAULT: VaultData = { schemaVersion: 1, hosts: [] };
```

- [ ] **Step 2: Commit**

```bash
git add src/hosts/types.ts
git commit -m "feat(hosts): Host types and zod schema"
```

---

## Task 8: HostRepo CRUD (TDD)

**Files:**
- Create: `tests/repo.test.ts`
- Create: `src/hosts/repo.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/repo.test.ts
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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/repo.test.ts`
Expected: FAIL "Cannot find module '../src/hosts/repo.js'"

- [ ] **Step 3: Write `src/hosts/repo.ts`**

```ts
import { nanoid } from 'nanoid';
import { Vault } from '../vault/vault.js';
import { Host, HostInput, HostInputSchema, VaultData } from './types.js';

export class HostRepo {
  constructor(private readonly vault: Vault<VaultData>) {}

  list(): Host[] {
    return [...this.vault.data.hosts];
  }

  get(id: string): Host | undefined {
    return this.vault.data.hosts.find((h) => h.id === id);
  }

  async add(input: HostInput): Promise<Host> {
    const parsed = HostInputSchema.parse(input);
    if (this.vault.data.hosts.some((h) => h.alias === parsed.alias)) {
      throw new Error(`alias "${parsed.alias}" already exists`);
    }
    const now = new Date().toISOString();
    const host: Host = {
      id: `h_${nanoid(10)}`,
      ...parsed,
      createdAt: now,
      updatedAt: now,
    };
    this.vault.data.hosts.push(host);
    await this.vault.save();
    return host;
  }

  async update(id: string, patch: Partial<HostInput>): Promise<Host> {
    const idx = this.vault.data.hosts.findIndex((h) => h.id === id);
    if (idx < 0) throw new Error(`no host with id ${id}`);
    const current = this.vault.data.hosts[idx];
    const merged = { ...current, ...patch };
    const parsed = HostInputSchema.parse({
      alias: merged.alias,
      host: merged.host,
      port: merged.port,
      user: merged.user,
      password: merged.password,
      note: merged.note,
    });
    if (
      this.vault.data.hosts.some((h) => h.id !== id && h.alias === parsed.alias)
    ) {
      throw new Error(`alias "${parsed.alias}" already exists`);
    }
    const updated: Host = {
      ...current,
      ...parsed,
      updatedAt: new Date().toISOString(),
    };
    // ensure updatedAt differs even if called within same ms:
    if (updated.updatedAt === current.updatedAt) {
      updated.updatedAt = new Date(Date.now() + 1).toISOString();
    }
    this.vault.data.hosts[idx] = updated;
    await this.vault.save();
    return updated;
  }

  async remove(id: string): Promise<void> {
    const before = this.vault.data.hosts.length;
    this.vault.data.hosts = this.vault.data.hosts.filter((h) => h.id !== id);
    if (this.vault.data.hosts.length === before) {
      throw new Error(`no host with id ${id}`);
    }
    await this.vault.save();
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/repo.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hosts/repo.ts tests/repo.test.ts
git commit -m "feat(hosts): HostRepo CRUD with alias uniqueness"
```

---

## Task 9: Known-hosts store

**Files:**
- Create: `src/ssh/knownHosts.ts`

- [ ] **Step 1: Write `src/ssh/knownHosts.ts`**

```ts
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface KnownHostEntry {
  host: string;
  port: number;
  fingerprint: string; // sha256:hex
}

export class KnownHosts {
  private entries: KnownHostEntry[] = [];
  private loaded = false;

  constructor(private readonly file: string) {}

  static fingerprintOf(keyBuf: Buffer): string {
    return 'sha256:' + createHash('sha256').update(keyBuf).digest('hex');
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const buf = await readFile(this.file, 'utf8');
      this.entries = JSON.parse(buf) as KnownHostEntry[];
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
      this.entries = [];
    }
    this.loaded = true;
  }

  find(host: string, port: number): KnownHostEntry | undefined {
    return this.entries.find((e) => e.host === host && e.port === port);
  }

  async add(entry: KnownHostEntry): Promise<void> {
    this.entries = this.entries.filter(
      (e) => !(e.host === entry.host && e.port === entry.port),
    );
    this.entries.push(entry);
    await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    await writeFile(this.file, JSON.stringify(this.entries, null, 2), { mode: 0o600 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ssh/knownHosts.ts
git commit -m "feat(ssh): known_hosts.json store with sha256 fingerprints"
```

---

## Task 10: SshClient connect against embedded server (TDD)

**Files:**
- Create: `tests/ssh-client.test.ts`
- Create: `src/ssh/client.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/ssh-client.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { Server as SshServer } from 'ssh2';
import { PassThrough } from 'node:stream';
import { SshClient } from '../src/ssh/client.js';
import { KnownHosts } from '../src/ssh/knownHosts.js';

function startServer(expectedUser: string, expectedPass: string) {
  // Generate RSA host key in OpenSSH PEM format
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const server = new SshServer({ hostKeys: [privateKey] }, (client) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === expectedUser && ctx.password === expectedPass) {
        ctx.accept();
      } else if (ctx.method === 'none') {
        ctx.reject(['password']);
      } else {
        ctx.reject();
      }
    });
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept();
        session.on('pty', (a) => a());
        session.on('shell', (accept2) => {
          const stream = accept2();
          stream.write('hello\r\n');
          stream.on('data', (d: Buffer) => {
            if (d.toString().includes('quit')) {
              stream.exit(0);
              stream.end();
            }
          });
        });
      });
    });
  });

  return new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      resolve({
        port,
        close: () =>
          new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.shift()!();
});

async function tmpKnownHosts() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sshm-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return new KnownHosts(path.join(dir, 'known_hosts.json'));
}

describe('SshClient', () => {
  it('connects with password and exits cleanly', async () => {
    const srv = await startServer('alice', 'pw1');
    cleanups.push(srv.close);

    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const known = await tmpKnownHosts();

    const client = new SshClient({
      stdin,
      stdout,
      stderr,
      knownHosts: known,
      onUnknownHost: async () => true, // auto-trust
      term: 'xterm',
      rows: 24,
      cols: 80,
    });

    const result = client.connect({
      id: 'x',
      alias: 'x',
      host: '127.0.0.1',
      port: srv.port,
      user: 'alice',
      password: 'pw1',
      note: '',
      createdAt: '',
      updatedAt: '',
    });

    // wait for greeting then send quit
    await new Promise<void>((resolve) => {
      stdout.on('data', (d: Buffer) => {
        if (d.toString().includes('hello')) {
          stdin.write('quit\n');
          resolve();
        }
      });
    });

    const code = await result;
    expect(code).toBe(0);
  });

  it('rejects wrong password', async () => {
    const srv = await startServer('alice', 'pw1');
    cleanups.push(srv.close);

    const known = await tmpKnownHosts();
    const client = new SshClient({
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      knownHosts: known,
      onUnknownHost: async () => true,
      term: 'xterm',
      rows: 24,
      cols: 80,
    });

    await expect(
      client.connect({
        id: 'x',
        alias: 'x',
        host: '127.0.0.1',
        port: srv.port,
        user: 'alice',
        password: 'WRONG',
        note: '',
        createdAt: '',
        updatedAt: '',
      }),
    ).rejects.toThrow();
  });

  it('refuses untrusted host when onUnknownHost returns false', async () => {
    const srv = await startServer('alice', 'pw1');
    cleanups.push(srv.close);

    const known = await tmpKnownHosts();
    const client = new SshClient({
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      knownHosts: known,
      onUnknownHost: async () => false,
      term: 'xterm',
      rows: 24,
      cols: 80,
    });

    await expect(
      client.connect({
        id: 'x',
        alias: 'x',
        host: '127.0.0.1',
        port: srv.port,
        user: 'alice',
        password: 'pw1',
        note: '',
        createdAt: '',
        updatedAt: '',
      }),
    ).rejects.toThrow(/trust/i);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/ssh-client.test.ts`
Expected: FAIL "Cannot find module '../src/ssh/client.js'"

- [ ] **Step 3: Write `src/ssh/client.ts`**

```ts
import { Client as Ssh2Client } from 'ssh2';
import { Readable, Writable } from 'node:stream';
import { Host } from '../hosts/types.js';
import { KnownHosts } from './knownHosts.js';

export interface SshClientOptions {
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  knownHosts: KnownHosts;
  /** Return true to trust, false to abort. */
  onUnknownHost: (fingerprint: string, host: string, port: number) => Promise<boolean>;
  term: string;
  rows: number;
  cols: number;
  /** Optional resize subscription. Invoke the listener whenever size changes. */
  onResize?: (cb: (rows: number, cols: number) => void) => () => void;
}

export class SshClient {
  constructor(private readonly opts: SshClientOptions) {}

  async connect(host: Host): Promise<number> {
    await this.opts.knownHosts.load();

    return new Promise<number>((resolve, reject) => {
      const client = new Ssh2Client();
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        client.end();
        fn();
      };

      client.on('error', (err) => finish(() => reject(err)));

      client.on('ready', () => {
        client.shell(
          { term: this.opts.term, rows: this.opts.rows, cols: this.opts.cols },
          (err, stream) => {
            if (err) return finish(() => reject(err));

            this.opts.stdin.pipe(stream);
            stream.pipe(this.opts.stdout);
            stream.stderr.pipe(this.opts.stderr);

            let unsubResize: (() => void) | undefined;
            if (this.opts.onResize) {
              unsubResize = this.opts.onResize((rows, cols) => {
                stream.setWindow(rows, cols, 0, 0);
              });
            }

            let exitCode = 0;
            stream.on('exit', (code: number) => {
              exitCode = code ?? 0;
            });
            stream.on('close', () => {
              this.opts.stdin.unpipe(stream);
              unsubResize?.();
              finish(() => resolve(exitCode));
            });
          },
        );
      });

      const hv = async (key: Buffer, cb: (ok: boolean) => void) => {
        const fp = KnownHosts.fingerprintOf(key);
        const existing = this.opts.knownHosts.find(host.host, host.port);
        if (existing) {
          cb(existing.fingerprint === fp);
          return;
        }
        const trust = await this.opts.onUnknownHost(fp, host.host, host.port);
        if (!trust) {
          finish(() => reject(new Error(`host fingerprint not trusted (${fp})`)));
          cb(false);
          return;
        }
        await this.opts.knownHosts.add({ host: host.host, port: host.port, fingerprint: fp });
        cb(true);
      };

      client.connect({
        host: host.host,
        port: host.port,
        username: host.user,
        password: host.password,
        readyTimeout: 15000,
        hostVerifier: hv as any,
      });
    });
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/ssh-client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ssh/client.ts tests/ssh-client.test.ts
git commit -m "feat(ssh): SshClient with password auth and fingerprint trust"
```

---

## Task 11: UI Context

**Files:**
- Create: `src/ui/context.tsx`

- [ ] **Step 1: Write `src/ui/context.tsx`**

```tsx
import React, { createContext, useContext } from 'react';
import { Vault } from '../vault/vault.js';
import { HostRepo } from '../hosts/repo.js';
import { VaultData } from '../hosts/types.js';

interface Services {
  vault: Vault<VaultData>;
  repo: HostRepo;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({
  vault,
  repo,
  children,
}: {
  vault: Vault<VaultData>;
  repo: HostRepo;
  children: React.ReactNode;
}) {
  return (
    <ServicesContext.Provider value={{ vault, repo }}>{children}</ServicesContext.Provider>
  );
}

export function useServices(): Services {
  const v = useContext(ServicesContext);
  if (!v) throw new Error('ServicesProvider missing');
  return v;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/context.tsx
git commit -m "feat(ui): services context for vault/repo injection"
```

---

## Task 12: ConfirmModal component

**Files:**
- Create: `src/ui/components/ConfirmModal.tsx`

- [ ] **Step 1: Write `src/ui/components/ConfirmModal.tsx`**

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export function ConfirmModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [focus, setFocus] = useState<'cancel' | 'ok'>('cancel');

  useInput((input, key) => {
    if (key.leftArrow || key.rightArrow || input === 'h' || input === 'l' || key.tab) {
      setFocus((f) => (f === 'cancel' ? 'ok' : 'cancel'));
    } else if (key.return) {
      focus === 'ok' ? onConfirm() : onCancel();
    } else if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>{message}</Text>
      <Box marginTop={1} gap={2}>
        <Text inverse={focus === 'cancel'}>[ 取消 ]</Text>
        <Text inverse={focus === 'ok'}>[ 删除 ]</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/ConfirmModal.tsx
git commit -m "feat(ui): ConfirmModal component"
```

---

## Task 13: Footer component

**Files:**
- Create: `src/ui/components/Footer.tsx`

- [ ] **Step 1: Write `src/ui/components/Footer.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';

export function Footer({ hints }: { hints: string }) {
  return (
    <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} paddingX={1}>
      <Text color="gray">{hints}</Text>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/Footer.tsx
git commit -m "feat(ui): Footer component"
```

---

## Task 14: HostList component

**Files:**
- Create: `src/ui/components/HostList.tsx`

- [ ] **Step 1: Write `src/ui/components/HostList.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import { Host } from '../../hosts/types.js';

export function HostList({
  hosts,
  selectedId,
}: {
  hosts: Host[];
  selectedId: string | null;
}) {
  if (hosts.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color="gray">(no hosts yet — press 'a' to add one)</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" paddingX={1}>
      {hosts.map((h) => {
        const sel = h.id === selectedId;
        const prefix = sel ? '> ' : '  ';
        return (
          <Text key={h.id} inverse={sel}>
            {prefix}
            {h.alias.padEnd(20)} {h.user}@{h.host}:{h.port}
          </Text>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/HostList.tsx
git commit -m "feat(ui): HostList component"
```

---

## Task 15: InitScreen (first-run master password)

**Files:**
- Create: `src/ui/screens/InitScreen.tsx`

- [ ] **Step 1: Write `src/ui/screens/InitScreen.tsx`**

```tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

export function InitScreen({
  onSubmit,
}: {
  onSubmit: (password: string) => Promise<void>;
}) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [stage, setStage] = useState<'first' | 'confirm'>('first');
  const [err, setErr] = useState<string | null>(null);

  const submitFirst = () => {
    if (pw.length < 4) {
      setErr('master password must be ≥ 4 characters');
      return;
    }
    setErr(null);
    setStage('confirm');
  };

  const submitConfirm = async () => {
    if (pw !== pw2) {
      setErr('passwords do not match');
      setPw2('');
      return;
    }
    setErr(null);
    try {
      await onSubmit(pw);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>欢迎使用 sshm — 设置主密码</Text>
      <Text color="gray">主密码用于加密所有主机凭据,无法找回,请妥善记忆。</Text>
      <Box marginTop={1}>
        <Text>主密码: </Text>
        {stage === 'first' ? (
          <TextInput value={pw} onChange={setPw} onSubmit={submitFirst} mask="•" />
        ) : (
          <Text>{'•'.repeat(pw.length)}</Text>
        )}
      </Box>
      {stage === 'confirm' && (
        <Box>
          <Text>再次输入: </Text>
          <TextInput value={pw2} onChange={setPw2} onSubmit={submitConfirm} mask="•" />
        </Box>
      )}
      {err && (
        <Box marginTop={1}>
          <Text color="red">{err}</Text>
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/screens/InitScreen.tsx
git commit -m "feat(ui): InitScreen for first-run master password setup"
```

---

## Task 16: UnlockScreen

**Files:**
- Create: `src/ui/screens/UnlockScreen.tsx`

- [ ] **Step 1: Write `src/ui/screens/UnlockScreen.tsx`**

```tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

export function UnlockScreen({
  onSubmit,
}: {
  onSubmit: (password: string) => Promise<void>;
}) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    try {
      await onSubmit(pw);
    } catch (e: any) {
      setErr('主密码错误,请重试');
      setPw('');
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>解锁 sshm</Text>
      <Box marginTop={1}>
        <Text>主密码: </Text>
        <TextInput value={pw} onChange={setPw} onSubmit={submit} mask="•" />
      </Box>
      {err && (
        <Box marginTop={1}>
          <Text color="red">{err}</Text>
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/screens/UnlockScreen.tsx
git commit -m "feat(ui): UnlockScreen"
```

---

## Task 17: HostFormScreen

**Files:**
- Create: `src/ui/screens/HostFormScreen.tsx`

- [ ] **Step 1: Write `src/ui/screens/HostFormScreen.tsx`**

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { Host, HostInput } from '../../hosts/types.js';

interface Props {
  initial?: Host;
  onSave: (input: HostInput) => Promise<void>;
  onCancel: () => void;
}

const FIELDS = ['alias', 'host', 'port', 'user', 'password', 'note'] as const;
type Field = (typeof FIELDS)[number];

export function HostFormScreen({ initial, onSave, onCancel }: Props) {
  const [values, setValues] = useState({
    alias: initial?.alias ?? '',
    host: initial?.host ?? '',
    port: String(initial?.port ?? 22),
    user: initial?.user ?? '',
    password: initial?.password ?? '',
    note: initial?.note ?? '',
  });
  const [focus, setFocus] = useState<Field>('alias');
  const [err, setErr] = useState<string | null>(null);

  const moveFocus = (dir: 1 | -1) => {
    const idx = FIELDS.indexOf(focus);
    const next = (idx + dir + FIELDS.length) % FIELDS.length;
    setFocus(FIELDS[next]);
  };

  useInput((input, key) => {
    if (key.escape) onCancel();
    else if (key.ctrl && input === 's') trySave();
    else if (key.tab && key.shift) moveFocus(-1);
    else if (key.tab) moveFocus(1);
  });

  const trySave = async () => {
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setErr('port must be an integer 1–65535');
      setFocus('port');
      return;
    }
    try {
      await onSave({
        alias: values.alias.trim(),
        host: values.host.trim(),
        port,
        user: values.user.trim(),
        password: values.password,
        note: values.note,
      });
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  };

  const row = (field: Field, label: string, mask?: string) => (
    <Box key={field}>
      <Text color={focus === field ? 'cyan' : undefined}>{label.padEnd(10)}</Text>
      {focus === field ? (
        <TextInput
          value={values[field]}
          onChange={(v) => setValues((s) => ({ ...s, [field]: v }))}
          onSubmit={() => (field === 'note' ? trySave() : moveFocus(1))}
          mask={mask}
        />
      ) : (
        <Text>{mask ? mask.repeat(values[field].length) : values[field]}</Text>
      )}
    </Box>
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>{initial ? '编辑主机' : '添加主机'}</Text>
      <Box flexDirection="column" marginTop={1}>
        {row('alias', '别名:')}
        {row('host', 'host:')}
        {row('port', 'port:')}
        {row('user', 'user:')}
        {row('password', '密码:', '•')}
        {row('note', '备注:')}
      </Box>
      {err && (
        <Box marginTop={1}>
          <Text color="red">{err}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="gray">Tab/↑↓ 切换字段   Enter 下一项   Ctrl-S 保存   Esc 取消</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/screens/HostFormScreen.tsx
git commit -m "feat(ui): HostFormScreen for add/edit"
```

---

## Task 18: ListScreen + smoke test

**Files:**
- Create: `src/ui/screens/ListScreen.tsx`
- Create: `tests/ui/listScreen.test.tsx`

- [ ] **Step 1: Write `src/ui/screens/ListScreen.tsx`**

```tsx
import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Host } from '../../hosts/types.js';
import { HostList } from '../components/HostList.js';
import { Footer } from '../components/Footer.js';
import { ConfirmModal } from '../components/ConfirmModal.js';

interface Props {
  hosts: Host[];
  onConnect: (h: Host) => void;
  onAdd: () => void;
  onEdit: (h: Host) => void;
  onDelete: (h: Host) => Promise<void>;
}

export function ListScreen({ hosts, onConnect, onAdd, onEdit, onDelete }: Props) {
  const { exit } = useApp();
  const [cursor, setCursor] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<Host | null>(null);

  const selected = hosts[cursor];

  useInput((input, key) => {
    if (pendingDelete) return; // modal owns input
    if (key.upArrow || input === 'k') setCursor((c) => Math.max(0, c - 1));
    else if (key.downArrow || input === 'j')
      setCursor((c) => Math.min(Math.max(hosts.length - 1, 0), c + 1));
    else if (key.return && selected) onConnect(selected);
    else if (input === 'a') onAdd();
    else if (input === 'e' && selected) onEdit(selected);
    else if (input === 'd' && selected) setPendingDelete(selected);
    else if (input === 'q') exit();
  });

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" paddingX={1}>
        <Text bold>sshm v0.1</Text>
        <Box flexGrow={1} />
        <Text color="gray">{hosts.length} hosts</Text>
      </Box>
      <HostList hosts={hosts} selectedId={selected?.id ?? null} />
      <Footer hints="↑↓ 选择   Enter 连接   a 添加   e 编辑   d 删除   q 退出" />
      {pendingDelete && (
        <ConfirmModal
          message={`确认删除 "${pendingDelete.alias}" ?`}
          onConfirm={async () => {
            const h = pendingDelete;
            setPendingDelete(null);
            await onDelete(h);
            setCursor((c) => Math.max(0, c - (c >= hosts.length - 1 ? 1 : 0)));
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Write smoke test `tests/ui/listScreen.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ListScreen } from '../../src/ui/screens/ListScreen.js';
import { Host } from '../../src/hosts/types.js';

const hosts: Host[] = [
  {
    id: 'h_1',
    alias: 'prod-web-1',
    host: '10.0.0.5',
    port: 22,
    user: 'deploy',
    password: 'x',
    note: '',
    createdAt: '',
    updatedAt: '',
  },
];

describe('ListScreen', () => {
  it('renders host and footer hint', () => {
    const { lastFrame } = render(
      <ListScreen
        hosts={hosts}
        onConnect={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('prod-web-1');
    expect(frame).toContain('deploy@10.0.0.5:22');
    expect(frame).toContain('Enter 连接');
  });

  it('triggers onConnect when Enter pressed', () => {
    const onConnect = vi.fn();
    const { stdin } = render(
      <ListScreen
        hosts={hosts}
        onConnect={onConnect}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    stdin.write('\r');
    expect(onConnect).toHaveBeenCalledWith(hosts[0]);
  });
});
```

- [ ] **Step 3: Run UI test**

Run: `npx vitest run tests/ui/listScreen.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/ListScreen.tsx tests/ui/listScreen.test.tsx
git commit -m "feat(ui): ListScreen with key bindings"
```

---

## Task 19: App router

**Files:**
- Create: `src/ui/App.tsx`

- [ ] **Step 1: Write `src/ui/App.tsx`**

```tsx
import React, { useState } from 'react';
import { useServices } from './context.js';
import { ListScreen } from './screens/ListScreen.js';
import { HostFormScreen } from './screens/HostFormScreen.js';
import { Host } from '../hosts/types.js';

interface Props {
  onConnect: (h: Host) => void;
}

type Route =
  | { kind: 'list' }
  | { kind: 'add' }
  | { kind: 'edit'; host: Host };

export function App({ onConnect }: Props) {
  const { repo } = useServices();
  const [route, setRoute] = useState<Route>({ kind: 'list' });
  const [, force] = useState(0);

  const refresh = () => force((n) => n + 1);

  if (route.kind === 'add') {
    return (
      <HostFormScreen
        onCancel={() => setRoute({ kind: 'list' })}
        onSave={async (input) => {
          await repo.add(input);
          setRoute({ kind: 'list' });
          refresh();
        }}
      />
    );
  }

  if (route.kind === 'edit') {
    return (
      <HostFormScreen
        initial={route.host}
        onCancel={() => setRoute({ kind: 'list' })}
        onSave={async (input) => {
          await repo.update(route.host.id, input);
          setRoute({ kind: 'list' });
          refresh();
        }}
      />
    );
  }

  return (
    <ListScreen
      hosts={repo.list()}
      onConnect={onConnect}
      onAdd={() => setRoute({ kind: 'add' })}
      onEdit={(h) => setRoute({ kind: 'edit', host: h })}
      onDelete={async (h) => {
        await repo.remove(h.id);
        refresh();
      }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/App.tsx
git commit -m "feat(ui): App router (list/add/edit)"
```

---

## Task 20: CLI entry — orchestration

**Files:**
- Create: `src/index.tsx`

- [ ] **Step 1: Write `src/index.tsx`**

```tsx
import React from 'react';
import { render } from 'ink';
import { existsSync } from 'node:fs';
import { defaultPaths } from './paths.js';
import { Vault } from './vault/vault.js';
import { HostRepo } from './hosts/repo.js';
import { EMPTY_VAULT, Host, VaultData } from './hosts/types.js';
import { KnownHosts } from './ssh/knownHosts.js';
import { SshClient } from './ssh/client.js';
import { ServicesProvider } from './ui/context.js';
import { App } from './ui/App.js';
import { InitScreen } from './ui/screens/InitScreen.js';
import { UnlockScreen } from './ui/screens/UnlockScreen.js';
import readline from 'node:readline';

const paths = defaultPaths();

async function readMasterPassword(prompt: 'init' | 'unlock'): Promise<{
  vault: Vault<VaultData>;
}> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const ui = render(
      prompt === 'init' ? (
        <InitScreen
          onSubmit={async (pw) => {
            const v = await Vault.create<VaultData>(paths.vaultFile, pw, EMPTY_VAULT);
            resolved = true;
            ui.unmount();
            await ui.waitUntilExit();
            resolve({ vault: v });
          }}
        />
      ) : (
        <UnlockScreen
          onSubmit={async (pw) => {
            const v = await Vault.unlock<VaultData>(paths.vaultFile, pw);
            resolved = true;
            ui.unmount();
            await ui.waitUntilExit();
            resolve({ vault: v });
          }}
        />
      ),
    );
    ui.waitUntilExit().then(() => {
      if (!resolved) reject(new Error('cancelled'));
    });
  });
}

async function runMain(vault: Vault<VaultData>) {
  const repo = new HostRepo(vault);
  const known = new KnownHosts(paths.knownHostsFile);

  // Connect handler: unmount Ink, run SSH session, then re-render.
  const runUi = (): Promise<Host | null> =>
    new Promise((resolve) => {
      const ui = render(
        <ServicesProvider vault={vault} repo={repo}>
          <App
            onConnect={(h) => {
              ui.unmount();
              ui.waitUntilExit().then(() => resolve(h));
            }}
          />
        </ServicesProvider>,
      );
      ui.waitUntilExit().then(() => resolve(null));
    });

  while (true) {
    const target = await runUi();
    if (!target) return; // user quit

    const onUnknownHost = async (
      fingerprint: string,
      host: string,
      port: number,
    ): Promise<boolean> => {
      process.stdout.write(
        `\n首次连接 ${host}:${port}\n指纹: ${fingerprint}\n是否信任此主机? [y/N] `,
      );
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((res) => rl.question('', (a) => res(a)));
      rl.close();
      return /^y(es)?$/i.test(answer.trim());
    };

    const client = new SshClient({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      knownHosts: known,
      onUnknownHost,
      term: process.env.TERM ?? 'xterm-256color',
      rows: process.stdout.rows ?? 24,
      cols: process.stdout.columns ?? 80,
      onResize: (cb) => {
        const handler = () => cb(process.stdout.rows ?? 24, process.stdout.columns ?? 80);
        process.stdout.on('resize', handler);
        return () => process.stdout.off('resize', handler);
      },
    });

    process.stdin.setRawMode?.(true);
    let exitCode = 0;
    try {
      exitCode = await client.connect(target);
    } catch (e: any) {
      process.stderr.write(`\n[连接错误] ${e.message ?? e}\n`);
    } finally {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
    }

    process.stdout.write(`\n[已断开 ${target.alias}, 退出码 ${exitCode},按任意键返回列表]\n`);
    await new Promise<void>((res) => {
      const onData = () => {
        process.stdin.off('data', onData);
        res();
      };
      process.stdin.resume();
      process.stdin.once('data', onData);
    });
  }
}

async function main() {
  try {
    const { vault } = existsSync(paths.vaultFile)
      ? await readMasterPassword('unlock')
      : await readMasterPassword('init');
    await runMain(vault);
  } catch (e: any) {
    if (e?.message !== 'cancelled') {
      process.stderr.write(`错误: ${e?.message ?? e}\n`);
      process.exit(1);
    }
  }
}

main();
```

- [ ] **Step 2: Build to verify no type errors**

Run: `npm run build`
Expected: clean compile, `dist/` populated.

- [ ] **Step 3: Commit**

```bash
git add src/index.tsx
git commit -m "feat(cli): entry orchestrating unlock → list → ssh session"
```

---

## Task 21: Full test pass + manual smoke

**Files:** (no edits; verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all suites PASS (crypto, vault, repo, ssh-client, listScreen).

- [ ] **Step 2: Manual smoke (against `localhost`)**

Ensure local sshd accepts password auth for your user (skip if not available).

Run:
```bash
npm run build
node bin/sshm.js
```

Walk through the acceptance checklist from spec §8:
1. Set master password → empty list
2. Add `localhost` host with your user/password → appears
3. Quit (`q`) → relaunch → unlock → list intact
4. Mistype master password → red error, no crash
5. Enter on `localhost` → real shell → run `vim` → resize terminal → `exit`
6. Edit the host (change note) → save → list updates
7. Delete it → confirm modal → list empties
8. Check perms: `ls -la ~/.sshm` shows `drwx------` and `-rw-------` for `vault.enc`

- [ ] **Step 3: Commit any fixes**

If smoke uncovers bugs, fix and commit per normal TDD loop.

```bash
git commit -m "fix: smoke-test issues"
```

---

## Self-Review

Spec coverage:

| Spec section | Covered by task(s) |
|---|---|
| §1 MVP scope (CRUD + connect) | Tasks 8, 10, 18, 19, 20 |
| §3 Vault file format & encryption | Tasks 3, 4, 5, 6 |
| §3 file permissions (0600/0700) | Task 6 (chmod) + Task 9 (mkdir 0700) + Task 21 smoke step 8 |
| §3 atomic write | Task 6 (write tmp → rename) |
| §3 error handling (missing/corrupt/wrong-pw) | Task 6 tests + Task 16 (UnlockScreen error) |
| §4 Host fields + zod validation | Tasks 7, 8 |
| §4 unique alias | Task 8 (add + update tests) |
| §5 SshClient (ssh2, raw mode, resize, fingerprint) | Tasks 9, 10, 20 |
| §5 unmount TUI before connect | Task 20 (`ui.unmount()` before SSH) |
| §5 error classification | Task 20 (`[连接错误]` print) — minimal but present |
| §6 InitScreen, UnlockScreen | Tasks 15, 16 |
| §6 ListScreen + key bindings | Task 18 |
| §6 HostFormScreen | Task 17 |
| §6 ConfirmModal default focus on cancel | Task 12 (`useState('cancel')`) |
| §7 project layout | Tasks 1–20 (file map at top) |
| §7 test layers | Tasks 3–10 (unit/integration), Task 18 (UI) |
| §8 acceptance checklist | Task 21 |

Placeholder scan: no TBD/TODO; every code step has full code; commands and expected outputs given.

Type consistency: `Vault<T>` generics consistent across tasks 6/8/11/19/20; `Host`/`HostInput` shapes consistent (tasks 7, 8, 17, 18, 19); `SshClient` constructor options match between definition (task 10) and call site (task 20); `KnownHosts.fingerprintOf` static used in both Task 10 (client) and Task 10 test — consistent.

One thing I'm flagging but consciously keeping minimal: error classification in Task 20 lumps all SSH errors into a single `[连接错误]` line rather than discriminating network/auth/fingerprint/timeout. The spec §5 lists this as a goal; the plan delivers a viable minimum (errors surface with their message) and leaves richer classification as a follow-up if desired.
