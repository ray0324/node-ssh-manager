# Auth Banner and Screen Clear Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared ASCII banner on init/unlock, then clear the visible terminal before the host list and before remote SSH output.

**Architecture:** Keep vault, list, and SSH protocol unchanged. Add a presentational `AuthBanner` and a `clearTerminal(stream)` helper. `src/index.tsx` calls the helper after auth unmount, after list unmount, and again after an unknown-host confirmation so the second clear stays in the caller.

**Tech Stack:** Node.js 18+, TypeScript 5, React 18, Ink 5, Vitest 1, ink-testing-library 4.

## Global Constraints

- Do not clear the screen when returning from a remote session to the list.
- Do not clear terminal scrollback.
- Do not change the vault format, host data, master-password flow, or SSH protocol.
- Do not add third-party dependencies.
- Do not add a CLI subcommand.
- Use the exact ASCII banner and the tagline `本地加密 SSH 主机管理器`.
- Write only `ESC[2J` and `ESC[H`; never `ESC[3J`.

Spec: `docs/superpowers/specs/2026-09-14-auth-banner-and-clear-design.md`

---

## File Structure

- Create `src/term/clearTerminal.ts`: write the display-clear and cursor-home sequence to a stream.
- Create `src/ui/components/AuthBanner.tsx`: render the ASCII logo and tagline.
- Modify `src/ui/screens/InitScreen.tsx`: place `AuthBanner` above the existing init copy.
- Modify `src/ui/screens/UnlockScreen.tsx`: place `AuthBanner` above the title `解锁`.
- Modify `src/index.tsx`: call `clearTerminal` after auth, after list unmount, and after unknown-host confirmation.
- Create `tests/term/clearTerminal.test.ts`.
- Create `tests/ui/authBanner.test.tsx`.
- Modify `tests/ui/authScreens.test.tsx`: assert banner and unlock title.

## Test Convention

```tsx
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
```

After `render(...)` and each `stdin.write(...)`, `await flush()` before reading the frame.

---

### Task 1: clearTerminal helper

**Files:**
- Create: `src/term/clearTerminal.ts`
- Create: `tests/term/clearTerminal.test.ts`

**Interfaces:**
- Produces: `clearTerminal(stream: { write(chunk: string): unknown }): void`.
- Produces constants: `CLEAR_DISPLAY = '\x1b[2J'` and `CURSOR_HOME = '\x1b[H'`.
- Writes exactly `CLEAR_DISPLAY + CURSOR_HOME` in one `write` call.
- Does not write `\x1b[3J`.

- [ ] **Step 1: Write the failing helper test**

Create `tests/term/clearTerminal.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
npx vitest run tests/term/clearTerminal.test.ts
```

Expected: FAIL because `src/term/clearTerminal.ts` does not exist.

- [ ] **Step 3: Implement clearTerminal**

Create `src/term/clearTerminal.ts`:

```ts
export const CLEAR_DISPLAY = '\x1b[2J';
export const CURSOR_HOME = '\x1b[H';

export function clearTerminal(stream: { write(chunk: string): unknown }): void {
  stream.write(`${CLEAR_DISPLAY}${CURSOR_HOME}`);
}
```

- [ ] **Step 4: Run the test and TypeScript check**

Run:

```bash
npx vitest run tests/term/clearTerminal.test.ts
npx tsc -p .
```

Expected: the test PASSes and `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/term/clearTerminal.ts tests/term/clearTerminal.test.ts
git commit -m "feat(term): clear visible screen without scrollback"
```

---

### Task 2: AuthBanner on init and unlock

**Files:**
- Create: `src/ui/components/AuthBanner.tsx`
- Create: `tests/ui/authBanner.test.tsx`
- Modify: `src/ui/screens/InitScreen.tsx`
- Modify: `src/ui/screens/UnlockScreen.tsx`
- Modify: `tests/ui/authScreens.test.tsx`

**Interfaces:**
- Produces: `AUTH_BANNER_LINES: string[]` with these exact six lines:

```
  ____  ____  _   _ __  __
 / ___|| ___|| | | |  \/  |
 \___ \|___ \| |_| | |\/| |
  ___) |___) |  _  | |  | |
 |____/|____/|_| |_|_|  |_|
  本地加密 SSH 主机管理器
```

- Produces: `AuthBanner(): JSX.Element` that renders each line as `Text`.
- Init keeps `欢迎使用 sshm · 设置主密码` and `主密码用于加密所有主机凭据，无法找回，请妥善保管。`
- Unlock title becomes exactly `解锁`.

- [ ] **Step 1: Write failing banner and screen tests**

Create `tests/ui/authBanner.test.tsx`:

```tsx
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
```

Add these tests to `tests/ui/authScreens.test.tsx`:

```tsx
import { AUTH_BANNER_LINES } from '../../src/ui/components/AuthBanner.js';

describe('auth banners', () => {
  it('shows the shared banner on init and unlock', () => {
    const init = render(<InitScreen onSubmit={vi.fn()} />).lastFrame() ?? '';
    const unlock = render(<UnlockScreen onSubmit={vi.fn()} />).lastFrame() ?? '';
    for (const line of AUTH_BANNER_LINES) {
      expect(init).toContain(line);
      expect(unlock).toContain(line);
    }
    expect(init).toContain('欢迎使用 sshm · 设置主密码');
    expect(init).toContain('无法找回');
    expect(unlock).toContain('解锁');
    expect(unlock).not.toContain('解锁 sshm');
  });
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
npx vitest run tests/ui/authBanner.test.tsx tests/ui/authScreens.test.tsx
```

Expected: FAIL because `AuthBanner` does not exist and unlock still says `解锁 sshm`.

- [ ] **Step 3: Implement AuthBanner**

Create `src/ui/components/AuthBanner.tsx`:

```tsx
import React from 'react';
import { Box, Text } from 'ink';

export const AUTH_BANNER_LINES = [
  '  ____  ____  _   _ __  __',
  ' / ___|| ___|| | | |  \\/  |',
  ' \\___ \\|___ \\| |_| | |\\/| |',
  '  ___) |___) |  _  | |  | |',
  ' |____/|____/|_| |_|_|  |_|',
  '  本地加密 SSH 主机管理器',
] as const;

export function AuthBanner() {
  return (
    <Box flexDirection="column">
      {AUTH_BANNER_LINES.map((line) => (
        <Text key={line}>{line}</Text>
      ))}
    </Box>
  );
}
```

- [ ] **Step 4: Mount the banner on both auth screens**

In `src/ui/screens/InitScreen.tsx`, add:

```tsx
import { AuthBanner } from '../components/AuthBanner.js';
```

Replace the top of the returned `Box` so it starts with:

```tsx
<Box flexDirection="column" padding={1}>
  <AuthBanner />
  <Box marginTop={1} flexDirection="column">
    <Text bold>欢迎使用 sshm · 设置主密码</Text>
    <Text color="gray">
      主密码用于加密所有主机凭据，无法找回，请妥善保管。
    </Text>
  </Box>
```

Keep the existing password fields, errors, and busy line after that block.

In `src/ui/screens/UnlockScreen.tsx`, add the same `AuthBanner` import and replace the title block with:

```tsx
<Box flexDirection="column" padding={1}>
  <AuthBanner />
  <Box marginTop={1}>
    <Text bold>解锁</Text>
  </Box>
```

Keep the existing password field, error, and busy line. Do not change submit locking or error copy.

- [ ] **Step 5: Run screen tests and TypeScript check**

Run:

```bash
npx vitest run tests/ui/authBanner.test.tsx tests/ui/authScreens.test.tsx
npx tsc -p .
```

Expected: those tests PASS and `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/AuthBanner.tsx src/ui/screens/InitScreen.tsx src/ui/screens/UnlockScreen.tsx tests/ui/authBanner.test.tsx tests/ui/authScreens.test.tsx
git commit -m "feat(ui): add sshm ASCII banner on auth screens"
```

---

### Task 3: Call clearTerminal from the process owner

**Files:**
- Modify: `src/index.tsx`

**Interfaces:**
- Consumes: `clearTerminal` from `src/term/clearTerminal.ts`.
- Does not change `SshClient`, `Vault`, `App`, or `ListScreen` APIs.
- After `readMasterPassword` resolves, call `clearTerminal(process.stdout)` before `runMain`.
- After `runUi` resolves with a host, call `clearTerminal(process.stdout)` before constructing `SshClient`.
- Inside `onUnknownHost`, after `promptYesNo()` returns `true`, call `clearTerminal(process.stdout)` before returning `true`.
- Do not call `clearTerminal` on password failure, cancel, connect failure, or disconnect-to-list.

- [ ] **Step 1: Add the import and the three call sites**

In `src/index.tsx`, add:

```tsx
import { clearTerminal } from './term/clearTerminal.js';
```

Replace `main` with:

```tsx
async function main() {
  try {
    const { vault } = existsSync(paths.vaultFile)
      ? await readMasterPassword('unlock')
      : await readMasterPassword('init');
    clearTerminal(process.stdout);
    await runMain(vault);
  } catch (e: any) {
    if (e?.message !== 'cancelled') {
      process.stderr.write(`错误: ${e?.message ?? e}\n`);
      process.exit(1);
    }
  }
}
```

In `runMain`, after `if (!target) return;` and the existing debug write, add:

```tsx
clearTerminal(process.stdout);
```

Replace `onUnknownHost` with:

```tsx
const onUnknownHost = async (
  fingerprint: string,
  host: string,
  port: number,
): Promise<boolean> => {
  process.stdout.write(
    `\n首次连接 ${host}:${port}\n指纹: ${fingerprint}\n是否信任此主机? [y/N] `,
  );
  const trusted = await promptYesNo();
  if (trusted) clearTerminal(process.stdout);
  return trusted;
};
```

Leave the disconnect `process.stdout.write` / `waitForAnyKey` / loop-back to `runUi` unchanged, with no `clearTerminal` there. Leave connect-error stderr writes unchanged.

- [ ] **Step 2: Run the full suite and TypeScript check**

Run:

```bash
npx vitest run
npx tsc -p .
```

Expected: all existing tests PASS (including `tests/ssh-client.test.ts`) and `tsc` exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/index.tsx
git commit -m "feat(ui): clear the screen before list and SSH output"
```

---
