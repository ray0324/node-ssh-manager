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
