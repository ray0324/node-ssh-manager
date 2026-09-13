import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import {
  AUTH_BANNER_LINES,
  AuthBanner,
} from '../../src/ui/components/AuthBanner.js';

describe('AuthBanner', () => {
  it('renders the sshm ASCII mark and tagline', () => {
    const { lastFrame } = render(<AuthBanner />);
    const frame = lastFrame() ?? '';
    for (const line of AUTH_BANNER_LINES) {
      expect(frame).toContain(line);
    }
    expect(AUTH_BANNER_LINES.every((line) => line.length <= 80)).toBe(true);
  });
});
