import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ListScreen } from '../../src/ui/screens/ListScreen.js';
import { Host } from '../../src/hosts/types.js';

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
    expect(frame).toContain('Enter 连接');
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
    await new Promise((r) => setImmediate(r));
    stdin.write('\r');
    await new Promise((r) => setImmediate(r));
    expect(onConnect).toHaveBeenCalledWith(hosts[0]);
  });
});
