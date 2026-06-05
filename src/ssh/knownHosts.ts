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
