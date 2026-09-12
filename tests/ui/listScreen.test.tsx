import { describe, it, expect, vi } from 'vitest';
import React, { type ReactElement } from 'react';
import { EventEmitter } from 'node:events';
import { render as inkRender } from 'ink';
import { render } from 'ink-testing-library';
import { ListScreen } from '../../src/ui/screens/ListScreen.js';
import { Host } from '../../src/hosts/types.js';

const mockExit = vi.fn();

vi.mock('ink', async (importOriginal) => {
  const original = await importOriginal<typeof import('ink')>();
  return {
    ...original,
    useApp: () => ({ exit: mockExit }),
  };
});

const flush = () => new Promise((r) => setImmediate(r));

const stripAnsi = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '');

function isWideCodePoint(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    width += isWideCodePoint(code) ? 2 : 1;
  }
  return width;
}

class TestStdout extends EventEmitter {
  frames: string[] = [];
  private last?: string;

  constructor(private readonly width: number) {
    super();
  }

  get columns() {
    return this.width;
  }

  write = (frame: string) => {
    this.frames.push(frame);
    this.last = frame;
  };

  lastFrame = () => this.last;
}

class TestStderr extends EventEmitter {
  write = () => {};
  lastFrame = () => undefined;
}

class TestStdin extends EventEmitter {
  isTTY = true;
  write = () => {};
  setRawMode = () => {};
  setEncoding = () => {};
  resume = () => {};
  pause = () => {};
  ref = () => {};
  unref = () => {};
  read = () => null;
}

function renderAtWidth(tree: ReactElement, width = 80) {
  const stdout = new TestStdout(width);
  const instance = inkRender(tree, {
    stdout,
    stderr: new TestStderr(),
    stdin: new TestStdin(),
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });

  return {
    lastFrame: () => stdout.lastFrame() ?? '',
    unmount: () => instance.unmount(),
  };
}

function assertFitsWidth(frame: string, maxWidth = 80) {
  const lines = frame.split('\n').filter((line) => line.length > 0);
  for (const line of lines) {
    expect(displayWidth(stripAnsi(line))).toBeLessThanOrEqual(maxWidth);
  }
}

const hosts: Host[] = [
  {
    id: 'h_1',
    alias: 'prod-web-1',
    host: '10.0.0.5',
    port: 22,
    user: 'deploy',
    password: 'x',
    note: '',
    createdAt: '',
    updatedAt: '',
  },
];

describe('ListScreen', () => {
  it('renders host and footer hint', () => {
    const { lastFrame } = render(
      <ListScreen
        hosts={hosts}
        onConnect={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('prod-web-1');
    expect(frame).toContain('deploy@10.0.0.5:22');
    expect(frame).toContain('sshm · SSH 主机管理器');
    expect(frame).toContain('1 台主机');
    expect(frame).toContain('›');
    expect(frame).toContain('Enter');
    expect(frame).toContain('连接');
  });

  it('shows a Chinese empty-state action', () => {
    const { lastFrame } = render(
      <ListScreen
        hosts={[]}
        onConnect={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(lastFrame()).toContain('还没有主机，按 a 添加第一台主机');
  });

  it('triggers onConnect when Enter pressed', async () => {
    const onConnect = vi.fn();
    const { stdin } = render(
      <ListScreen
        hosts={hosts}
        onConnect={onConnect}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    await flush();
    stdin.write('\r');
    await flush();
    expect(onConnect).toHaveBeenCalledWith(hosts[0]);
  });

  it('moves selection with j before connecting', async () => {
    const second = { ...hosts[0], id: 'h_2', alias: 'staging-web' };
    const onConnect = vi.fn();
    const { stdin } = render(
      <ListScreen
        hosts={[hosts[0], second]}
        onConnect={onConnect}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    await flush();
    stdin.write('j');
    await flush();
    stdin.write('\r');
    await flush();
    expect(onConnect).toHaveBeenCalledWith(second);
  });

  it('does not pass the password-close key through to list actions', async () => {
    const onAdd = vi.fn();
    const { stdin, lastFrame } = render(
      <ListScreen
        hosts={hosts}
        onConnect={vi.fn()}
        onAdd={onAdd}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    await flush();
    stdin.write('p');
    await flush();
    expect(lastFrame()).toContain('敏感信息 · prod-web-1');
    expect(lastFrame()).toContain('x');
    stdin.write('a');
    await flush();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('fits header, selected row, and two-row footer within 80 columns', () => {
    const { lastFrame, unmount } = renderAtWidth(
      <ListScreen
        hosts={hosts}
        onConnect={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const frame = lastFrame();
    assertFitsWidth(frame);
    expect(frame).toContain('sshm · SSH 主机管理器');
    expect(frame).toContain('1 台主机');
    expect(frame).toContain('prod-web-1');
    expect(frame).toContain('deploy@10.0.0.5:22');
    expect(frame).toContain('↑↓/jk');
    expect(frame).toContain('连接');
    expect(frame).toContain('查看密码');
    expect(frame).toContain('退出');
    unmount();
  });

  it('fits empty-state copy and footer within 80 columns', () => {
    const { lastFrame, unmount } = renderAtWidth(
      <ListScreen
        hosts={[]}
        onConnect={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const frame = lastFrame();
    assertFitsWidth(frame);
    expect(frame).toContain('还没有主机，按 a 添加第一台主机');
    expect(frame).toContain('0 台主机');
    expect(frame).toContain('添加');
    expect(frame).toContain('退出');
    unmount();
  });

  it('exits when q is pressed on the normal list', async () => {
    mockExit.mockClear();
    const { stdin } = render(
      <ListScreen
        hosts={hosts}
        onConnect={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    await flush();
    stdin.write('q');
    await flush();
    expect(mockExit).toHaveBeenCalledOnce();
  });

  it('deletes once and closes confirmation after success', async () => {
    const onDelete = vi.fn(async () => {});
    const { stdin, lastFrame } = render(
      <ListScreen
        hosts={hosts}
        onConnect={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await flush();
    stdin.write('d');
    await flush();
    stdin.write('\t');
    await flush();
    stdin.write('\r');
    await flush();
    expect(onDelete).toHaveBeenCalledOnce();
    expect(lastFrame()).not.toContain('确认删除');
  });
});
