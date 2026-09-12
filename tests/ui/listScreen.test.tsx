import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ListScreen } from '../../src/ui/screens/ListScreen.js';
import { Host } from '../../src/hosts/types.js';

const flush = () => new Promise((r) => setImmediate(r));

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
    const { stdin, lastFrame } = render(
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
});
