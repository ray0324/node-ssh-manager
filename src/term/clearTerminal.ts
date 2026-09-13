export const CLEAR_DISPLAY = '\x1b[2J';
export const CURSOR_HOME = '\x1b[H';

export function clearTerminal(stream: { write(chunk: string): unknown }): void {
  stream.write(`${CLEAR_DISPLAY}${CURSOR_HOME}`);
}
