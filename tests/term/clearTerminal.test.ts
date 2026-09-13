import { describe, expect, it } from 'vitest';
import { Writable } from 'node:stream';
import { clearTerminal } from '../../src/term/clearTerminal.js';

function captureStream() {
  let data = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      data += chunk.toString();
      callback();
    },
  });
  return {
    stream,
    text: () => data,
  };
}

describe('clearTerminal', () => {
  it('erases the display and homes the cursor without clearing scrollback', () => {
    const captured = captureStream();
    clearTerminal(captured.stream);
    expect(captured.text()).toBe('\x1b[2J\x1b[H');
    expect(captured.text()).not.toContain('\x1b[3J');
  });
});
