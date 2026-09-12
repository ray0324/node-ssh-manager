import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { HostFormScreen } from '../../src/ui/screens/HostFormScreen.js';
import { Host, HostInput } from '../../src/hosts/types.js';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

interface TestStdin {
  write: (input: string) => void;
}

const VALID_HOST: Host = {
  id: 'host-1',
  alias: 'demo',
  host: 'server',
  port: 22,
  user: 'root',
  password: 'secret',
  note: 'note',
  createdAt: '',
  updatedAt: '',
};

const VALID_INPUT: HostInput = {
  alias: 'demo',
  host: 'server',
  port: 22,
  user: 'root',
  password: 'secret',
  note: 'note',
};

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

  it.each([
    {
      field: 'host' as const,
      message: '请输入主机地址',
      label: '› 主机',
    },
    { field: 'user' as const, message: '请输入用户', label: '› 用户' },
    {
      field: 'password' as const,
      message: '请输入密码',
      label: '› 密码',
    },
  ])('validates and focuses an empty $field', async (required) => {
    const { stdin, lastFrame } = render(
      <HostFormScreen
        initial={{ ...VALID_HOST, [required.field]: '' }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await flush();
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain(required.message);
    expect(lastFrame()).toContain(required.label);
  });

  it.each([
    ['zero', 0],
    ['fractional', 1.5],
    ['nonnumeric', Number.NaN],
    ['too large', 65536],
  ])('rejects a %s port in Chinese', async (_case, port) => {
    const { stdin, lastFrame } = render(
      <HostFormScreen
        initial={{ ...VALID_HOST, port }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await flush();
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('端口必须是 1–65535 之间的整数');
  });

  it.each([1, 65535])('accepts boundary port %i', async (port) => {
    const onSave = vi.fn(async () => {});
    const { stdin } = render(
      <HostFormScreen
        initial={{ ...VALID_HOST, port }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    await flush();
    stdin.write('\x13');
    await flush();
    expect(onSave).toHaveBeenCalledWith({ ...VALID_INPUT, port });
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

  it('moves with Enter and submits from the note field', async () => {
    const onSave = vi.fn(async () => {});
    const { stdin, lastFrame } = render(
      <HostFormScreen
        initial={VALID_HOST}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    await flush();

    for (const label of ['主机', '端口', '用户', '密码', '备注']) {
      stdin.write('\r');
      await flush();
      expect(lastFrame()).toContain(`› ${label}`);
    }
    stdin.write('\r');
    await flush();

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(VALID_INPUT);
  });

  it('clears a field error when that field is edited', async () => {
    const { stdin, lastFrame } = render(
      <HostFormScreen onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    await flush();
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('请输入别名');

    stdin.write('d');
    await flush();
    expect(lastFrame()).not.toContain('请输入别名');
  });

  it('runs Ctrl+R without inserting text into the focused field', async () => {
    const onSave = vi.fn(async () => {});
    const { stdin, lastFrame } = render(
      <HostFormScreen
        initial={VALID_HOST}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    await flush();
    stdin.write('\x12');
    await flush();
    expect(lastFrame()).toContain('secret');

    stdin.write('\x13');
    await flush();
    expect(onSave).toHaveBeenCalledWith(VALID_INPUT);
  });

  it('retains normal input immediately following Ctrl+R', async () => {
    const onSave = vi.fn(async () => {});
    const { stdin } = render(
      <HostFormScreen
        initial={VALID_HOST}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    await flush();
    stdin.write('\x12');
    stdin.write('x');
    await flush();
    stdin.write('\x13');
    await flush();
    expect(onSave).toHaveBeenCalledWith({
      ...VALID_INPUT,
      alias: 'demox',
    });
  });

  it('retains normal input immediately following invalid Ctrl+S', async () => {
    const { stdin, lastFrame } = render(
      <HostFormScreen onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    await flush();
    stdin.write('\x13');
    stdin.write('d');
    await flush();
    expect(lastFrame()).not.toContain('请输入别名');

    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('请输入主机地址');
  });

  it('locks rapid duplicate saves while onSave is pending', async () => {
    let rejectSave!: (error: Error) => void;
    const onSave = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectSave = reject;
          }),
      )
      .mockResolvedValue(undefined);
    const { stdin, lastFrame } = render(
      <HostFormScreen onSave={onSave} onCancel={vi.fn()} />,
    );

    await fillValidForm(stdin);
    stdin.write('\x13');
    stdin.write('\x13');
    await flush();

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(VALID_INPUT);
    expect(lastFrame()).toContain('正在保存…');
    stdin.write('changed');
    await flush();
    rejectSave(new Error('network unavailable'));
    await flush();
    expect(lastFrame()).toContain('保存失败，请重试');
    await flush();
    stdin.write('\x13');
    await flush();
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenNthCalledWith(2, VALID_INPUT);
  });

  it('translates generic save errors and permits a retry', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValue(undefined);
    const { stdin, lastFrame } = render(
      <HostFormScreen
        initial={VALID_HOST}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    await flush();
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('保存失败，请重试');

    stdin.write('\x13');
    await flush();
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('focuses aliases and retains every field for retry', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('alias "demo" already exists'))
      .mockResolvedValue(undefined);
    const { stdin, lastFrame } = render(
      <HostFormScreen onSave={onSave} onCancel={vi.fn()} />,
    );

    await fillValidForm(stdin);
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('该别名已存在');
    expect(lastFrame()).toContain('demo');
    expect(lastFrame()).toContain('› 别名');

    stdin.write('\x13');
    await flush();
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenNthCalledWith(1, VALID_INPUT);
    expect(onSave).toHaveBeenNthCalledWith(2, VALID_INPUT);
  });
});
