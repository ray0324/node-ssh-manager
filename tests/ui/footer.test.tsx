import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { Footer } from '../../src/ui/components/Footer.js';

describe('Footer', () => {
  it('renders primary and secondary shortcut groups', () => {
    const { lastFrame } = render(
      <Footer
        primary={[{ key: 'Enter', label: '连接' }]}
        secondary={[{ key: 'q', label: '退出' }]}
      />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Enter');
    expect(frame).toContain('连接');
    expect(frame).toContain('q');
    expect(frame).toContain('退出');
  });
});
