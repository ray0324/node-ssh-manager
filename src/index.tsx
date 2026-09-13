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
import { clearTerminal } from './term/clearTerminal.js';

const paths = defaultPaths();

/**
 * Prompt the user for a single-key yes/no (y/Y → true, anything else → false).
 * Uses raw mode + a direct stdin 'data' listener — this is more reliable than
 * readline immediately after Ink unmounts, since the data listener itself
 * keeps the event loop alive.
 */
function promptYesNo(): Promise<boolean> {
  return new Promise((resolve) => {
    const stdin = process.stdin as any;
    const hadRaw = typeof stdin.setRawMode === 'function';
    if (hadRaw) stdin.setRawMode(true);
    if (typeof stdin.ref === 'function') stdin.ref();
    stdin.resume();
    const onData = (chunk: Buffer) => {
      const ch = chunk.toString('utf8')[0] ?? '';
      stdin.off('data', onData);
      if (hadRaw) stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write(`${ch}\n`);
      resolve(ch === 'y' || ch === 'Y');
    };
    stdin.on('data', onData);
  });
}

/** Wait for any single key. Same rationale as promptYesNo. */
function waitForAnyKey(): Promise<void> {
  return new Promise((resolve) => {
    const stdin = process.stdin as any;
    const hadRaw = typeof stdin.setRawMode === 'function';
    if (hadRaw) stdin.setRawMode(true);
    if (typeof stdin.ref === 'function') stdin.ref();
    stdin.resume();
    const onData = () => {
      stdin.off('data', onData);
      if (hadRaw) stdin.setRawMode(false);
      stdin.pause();
      resolve();
    };
    stdin.on('data', onData);
  });
}

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
      let picked: Host | null = null;
      const ui = render(
        <ServicesProvider vault={vault} repo={repo}>
          <App
            onConnect={(h) => {
              picked = h;
              ui.unmount();
            }}
          />
        </ServicesProvider>,
      );
      ui.waitUntilExit().then(() => {
        if (process.env.SSHM_DEBUG) {
          process.stderr.write(`[debug] runUi resolved picked=${picked?.alias ?? 'null'}\n`);
        }
        resolve(picked);
      });
    });

  while (true) {
    const target = await runUi();
    if (process.env.SSHM_DEBUG) {
      process.stderr.write(`[debug] target=${target?.alias ?? 'null'}\n`);
    }
    if (!target) return; // user quit

    clearTerminal(process.stdout);

    const onUnknownHost = async (
      fingerprint: string,
      host: string,
      port: number,
    ): Promise<boolean> => {
      process.stdout.write(
        `\n首次连接 ${host}:${port}\n指纹: ${fingerprint}\n是否信任此主机? [y/N] `,
      );
      const trusted = await promptYesNo();
      if (trusted) clearTerminal(process.stdout);
      return trusted;
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

    process.stdin.setRawMode?.(false);
    if (process.env.SSHM_DEBUG) {
      process.stderr.write(`[debug] starting client.connect to ${target.alias}\n`);
    }
    let exitCode = 0;
    try {
      exitCode = await client.connect(target);
    } catch (e: any) {
      process.stderr.write(`\n[连接错误] ${e.message ?? e}\n`);
    } finally {
      process.stdin.setRawMode?.(false);
    }

    process.stdout.write(`\n[已断开 ${target.alias}, 退出码 ${exitCode},按任意键返回列表]\n`);
    await waitForAnyKey();
  }
}

async function main() {
  try {
    const { vault } = existsSync(paths.vaultFile)
      ? await readMasterPassword('unlock')
      : await readMasterPassword('init');
    clearTerminal(process.stdout);
    await runMain(vault);
  } catch (e: any) {
    if (e?.message !== 'cancelled') {
      process.stderr.write(`错误: ${e?.message ?? e}\n`);
      process.exit(1);
    }
  }
}

main();
