import React from 'react';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { AuthBanner } from '../../src/ui/components/AuthBanner.js';

const version = createRequire(import.meta.url)('../../package.json').version as string;

describe('AuthBanner', () => {
  it('renders an open header with title, version, subtitle, and intro', () => {
    const { lastFrame } = render(<AuthBanner />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('sshm');
    expect(frame).toContain(`v${version}`);
    expect(frame).toContain('本地加密 SSH 主机管理器');
    expect(frame).toContain('凭据保存在本机，主密码无法找回');
    expect(frame).not.toMatch(/[╭┌╰┘│]/);
    expect(frame).not.toContain('____');
  });
});
