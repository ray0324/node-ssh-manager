import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { HostFormScreen } from '../../src/ui/screens/HostFormScreen.js';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

interface TestStdin {
  write: (input: string) => void;
}

async function fillValidForm(stdin: TestStdin) {
  await flush();
  stdin.write('demo');
  await flush();
  stdin.write('\t');
  await flush();
  stdin.write('server');
  await flush();
  stdin.write('\t');
  await flush();
  stdin.write('\t');
  await flush();
  stdin.write('root');
  await flush();
  stdin.write('\t');
  await flush();
  stdin.write('secret');
  await flush();
  stdin.write('\t');
  await flush();
  stdin.write('note');
  await flush();
}

describe('HostFormScreen', () => {
  it('uses Chinese labels and marks required fields', () => {
    const { lastFrame } = render(
      <HostFormScreen onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('添加主机');
    expect(frame).toContain('别名 *');
    expect(frame).toContain('主机 *');
    expect(frame).toContain('密码 *');
  });

  it('shows and focuses the first missing required field', async () => {
    const { stdin, lastFrame } = render(
      <HostFormScreen onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    await flush();
    stdin.write('\t');
    await flush();
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('请输入别名');
    expect(lastFrame()).toContain('› 别名');
  });

  it('rejects an invalid port in Chinese', async () => {
    const { stdin, lastFrame } = render(
      <HostFormScreen onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    await fillValidForm(stdin);
    stdin.write('\u001b[Z');
    await flush();
    stdin.write('\u001b[Z');
    await flush();
    stdin.write('\u001b[Z');
    await flush();
    stdin.write('\x7f');
    await flush();
    stdin.write('\x7f');
    await flush();
    stdin.write('0');
    await flush();
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('端口必须是 1–65535 之间的整数');
  });

  it('supports forward and reverse field navigation', async () => {
    const { stdin, lastFrame } = render(
      <HostFormScreen onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    await flush();
    stdin.write('\t');
    await flush();
    expect(lastFrame()).toContain('› 主机');
    stdin.write('\u001b[Z');
    await flush();
    expect(lastFrame()).toContain('› 别名');
  });

  it('locks rapid duplicate saves while onSave is pending', async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const { stdin, lastFrame } = render(
      <HostFormScreen onSave={onSave} onCancel={vi.fn()} />,
    );

    await fillValidForm(stdin);
    stdin.write('\x13');
    stdin.write('\x13');
    await flush();

    expect(onSave).toHaveBeenCalledOnce();
    expect(lastFrame()).toContain('正在保存…');
    resolveSave();
  });

  it('translates duplicate alias failures and keeps input', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('alias "demo" already exists');
    });
    const { stdin, lastFrame } = render(
      <HostFormScreen onSave={onSave} onCancel={vi.fn()} />,
    );

    await fillValidForm(stdin);
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('该别名已存在');
    expect(lastFrame()).toContain('demo');
  });
});
