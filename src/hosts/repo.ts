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
