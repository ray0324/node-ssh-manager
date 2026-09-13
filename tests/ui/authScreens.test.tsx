import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { AUTH_BANNER_LINES } from '../../src/ui/components/AuthBanner.js';
import { InitScreen } from '../../src/ui/screens/InitScreen.js';
import { UnlockScreen } from '../../src/ui/screens/UnlockScreen.js';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('auth banners', () => {
  it('shows the shared banner on init and unlock', () => {
    const init = render(<InitScreen onSubmit={vi.fn()} />).lastFrame() ?? '';
    const unlock = render(<UnlockScreen onSubmit={vi.fn()} />).lastFrame() ?? '';
    for (const line of AUTH_BANNER_LINES) {
      expect(init).toContain(line);
      expect(unlock).toContain(line);
    }
    expect(init).toContain('欢迎使用 sshm · 设置主密码');
    expect(init).toContain('无法找回');
    expect(unlock).toContain('解锁');
    expect(unlock).not.toContain('解锁 sshm');
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
