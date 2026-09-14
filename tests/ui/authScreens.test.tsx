import React from 'react';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { InitScreen } from '../../src/ui/screens/InitScreen.js';
import { UnlockScreen } from '../../src/ui/screens/UnlockScreen.js';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const version = createRequire(import.meta.url)('../../package.json').version as string;

function expectSharedAuthChrome(frame: string) {
  expect(frame).toContain('sshm');
  expect(frame).toContain(`v${version}`);
  expect(frame).toContain('本地加密 SSH 主机管理器');
  expect(frame).toContain('凭据保存在本机，主密码无法找回');
  expect(frame).toContain('主密码:');
  expect(frame).toContain('─');
  expect(frame).not.toMatch(/[╭╮╰╯│]/);
}

describe('auth banners', () => {
  it('shows the shared header and password band on init and unlock', () => {
    const init = render(<InitScreen onSubmit={vi.fn()} />).lastFrame() ?? '';
    const unlock = render(<UnlockScreen onSubmit={vi.fn()} />).lastFrame() ?? '';
    expectSharedAuthChrome(init);
    expectSharedAuthChrome(unlock);
    expect(init).not.toContain('欢迎使用');
    expect(unlock).not.toContain('解锁 sshm');
  });

  it('switches the init band to confirm after a valid first password', async () => {
    const { stdin, lastFrame } = render(<InitScreen onSubmit={vi.fn()} />);
    await flush();
    stdin.write('abcd\r');
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('再次输入:');
    expect(frame).not.toContain('主密码:');
  });
});

describe('InitScreen', () => {
  it('validates password length in Chinese', async () => {
    const { stdin, lastFrame } = render(
      <InitScreen onSubmit={vi.fn()} />,
    );
    await flush();
    stdin.write('abc\r');
    await flush();
    expect(lastFrame()).toContain('主密码至少需要 4 个字符');
  });

  it('blocks duplicate initialization submissions', async () => {
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn(
      () => new Promise<void>((resolve) => { resolveSubmit = resolve; }),
    );
    const { stdin, lastFrame } = render(<InitScreen onSubmit={onSubmit} />);
    await flush();
    stdin.write('abcd\r');
    await flush();
    stdin.write('abcd\r');
    await flush();
    stdin.write('\r');
    await flush();
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(lastFrame()).toContain('正在创建加密仓库…');
    resolveSubmit();
  });

  it('keeps valid input available after creation fails', async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error('disk');
    });
    const { stdin, lastFrame } = render(<InitScreen onSubmit={onSubmit} />);
    await flush();
    stdin.write('abcd\r');
    await flush();
    stdin.write('abcd\r');
    await flush();
    expect(lastFrame()).toContain('创建加密仓库失败，请重试');
    expect(lastFrame()).toContain('••••');
  });
});

describe('UnlockScreen', () => {
  it('clears a rejected password and allows retry', async () => {
    const onSubmit = vi
      .fn<(password: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('wrong'))
      .mockResolvedValueOnce();
    const { stdin, lastFrame } = render(<UnlockScreen onSubmit={onSubmit} />);

    await flush();
    stdin.write('bad\r');
    await flush();
    expect(lastFrame()).toContain('主密码错误，请重试');
    stdin.write('good\r');
    await flush();
    expect(onSubmit).toHaveBeenNthCalledWith(2, 'good');
  });

  it('shows a busy state and blocks duplicate unlocks', async () => {
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn(
      () => new Promise<void>((resolve) => { resolveSubmit = resolve; }),
    );
    const { stdin, lastFrame } = render(<UnlockScreen onSubmit={onSubmit} />);
    await flush();
    stdin.write('secret\r');
    await flush();
    stdin.write('\r');
    await flush();
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(lastFrame()).toContain('正在解锁…');
    resolveSubmit();
  });
});
