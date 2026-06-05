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
