import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { AuthPasswordField } from '../../src/ui/components/AuthPasswordField.js';

describe('AuthPasswordField', () => {
  it('renders a full-width band with only top and bottom rules', () => {
    const { lastFrame } = render(
      <AuthPasswordField
        label="主密码:"
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        focus
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('主密码:');
    expect(frame).toContain('─');
    expect(frame).not.toMatch(/[╭╮╰╯│]/);
    const rules = frame.split('\n').filter((line) => /^─+$/.test(line.trim()));
    expect(rules.length).toBeGreaterThanOrEqual(2);
    expect(rules[0]?.length).toBeGreaterThanOrEqual(40);
  });
});
