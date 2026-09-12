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

/**
 * Pre-flight: open a TCP connection just long enough to fetch the host key,
 * then close it. Used to prompt the user for fingerprint trust BEFORE the
 * real interactive session takes over stdin.
 */
function fetchHostKey(host: string, port: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const probe = new Ssh2Client();
    let got = false;
    probe.on('error', (e) => {
      // After we've captured the key and ended the probe, server-side
      // teardown errors (KEX abort, auth failure) surface here — ignore them.
      if (got) return;
      reject(e);
    });
    probe.on('close', () => {
      if (!got) reject(new Error('probe closed before host key was received'));
    });
    probe.connect({
      host,
      port,
      username: '__probe__',
      readyTimeout: 15000,
      hostVerifier: ((key: Buffer, cb: (ok: boolean) => void) => {
        got = true;
        resolve(Buffer.from(key));
        // Wait until both sides have installed their negotiated ciphers before
        // sending the probe's disconnect packet.
        probe.once('handshake', () => probe.end());
        cb(true);
      }) as any,
    });
  });
}

export class SshClient {
  constructor(private readonly opts: SshClientOptions) {}

  async connect(host: Host): Promise<number> {
    await this.opts.knownHosts.load();

    // Resolve fingerprint trust BEFORE the interactive session grabs stdin.
    // Otherwise the y/N prompt races with the ssh shell for keystrokes.
    let approvedFingerprint: string;
    const existing = this.opts.knownHosts.find(host.host, host.port);
    if (existing) {
      approvedFingerprint = existing.fingerprint;
    } else {
      const key = await fetchHostKey(host.host, host.port);
      const fp = KnownHosts.fingerprintOf(key);
      const trust = await this.opts.onUnknownHost(fp, host.host, host.port);
      if (!trust) throw new Error(`host fingerprint not trusted (${fp})`);
      await this.opts.knownHosts.add({ host: host.host, port: host.port, fingerprint: fp });
      approvedFingerprint = fp;
    }

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

            const stdinAny = this.opts.stdin as any;
            const hadRawMode = typeof stdinAny.setRawMode === 'function';
            const wasRaw = hadRawMode ? stdinAny.isRaw === true : false;
            if (hadRawMode) stdinAny.setRawMode(true);
            if (typeof stdinAny.ref === 'function') stdinAny.ref();
            if (typeof stdinAny.resume === 'function') stdinAny.resume();

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
              if (hadRawMode) stdinAny.setRawMode(wasRaw);
              finish(() => resolve(exitCode));
            });
          },
        );
      });

      const hv = (key: Buffer, cb: (ok: boolean) => void) => {
        cb(KnownHosts.fingerprintOf(key) === approvedFingerprint);
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
