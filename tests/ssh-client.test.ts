import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
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

  const errors: Error[] = [];
  const server = new SshServer({ hostKeys: [privateKey] }, (client) => {
    client.on('error', (error) => errors.push(error));
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

  return new Promise<{ port: number; errors: Error[]; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      resolve({
        port,
        errors,
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

  it('tears down host-key probes without corrupting SSH packets', async () => {
    const srv = await startServer('alice', 'pw1');
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

    for (let i = 0; i < 10; i++) {
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
    }

    await srv.close();
    expect(srv.errors.map((error) => error.message)).toEqual([]);
  });
});
