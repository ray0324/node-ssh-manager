# Change Master Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an unlocked user change the vault master password from the host list, after re-entering the current password, by atomically re-encrypting `vault.enc` with a new salt and key.

**Architecture:** Add `Vault.changePassword(current, next)` that verifies the current password with a timing-safe key compare, writes a new salt/key via the existing tmp + `fsync` + rename path, and only then replaces in-memory credentials. `App` gains a `change-password` route; `ChangePasswordScreen` owns validation and busy state; `ListScreen` opens that route on `c` and shows a one-keystroke success notice.

**Tech Stack:** Node.js 18+, TypeScript 5, React 18, Ink 5, ink-text-input 6, Vitest 1, ink-testing-library 4.

## Global Constraints

- Do not provide recovery or reset after a forgotten master password.
- Do not add a CLI subcommand such as `sshm passwd`.
- Do not add a settings page, backup copies, or multi-device sync.
- Do not change the vault file format, host data model, or SSH connection flow.
- Do not add third-party dependencies.
- Use Simplified Chinese for all user-facing copy.
- Keep existing list shortcuts; add `c` in the secondary footer group.

Spec: `docs/superpowers/specs/2026-09-14-change-master-password-design.md`

---

## File Structure

- Modify `src/vault/vault.ts`: add `changePassword`; extract shared persist; make `key`/`salt` reassignable after a successful rewrite.
- Create `src/ui/screens/ChangePasswordScreen.tsx`: three-field form, local validation, submit lock, error mapping.
- Modify `src/ui/App.tsx`: add `change-password` route and call `vault.changePassword`.
- Modify `src/ui/screens/ListScreen.tsx`: handle `c`, show success notice, add footer hint.
- Modify `README.md`: document the `c` shortcut.
- Modify `tests/vault.test.ts`: cover success, wrong current password, same password, persist failure.
- Create `tests/ui/changePasswordScreen.test.tsx`: cover validation, lock, Esc, vault error mapping.
- Modify `tests/ui/listScreen.test.tsx`: cover `c`, footer copy, and notice dismissal.

## Test Convention

UI tests that need React state to settle use:

```tsx
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
```

After `render(...)` and after each `stdin.write(...)`, call `await flush()` before inspecting the frame or mocks.

---

### Task 1: Vault.changePassword

**Files:**
- Modify: `src/vault/vault.ts`
- Test: `tests/vault.test.ts`

**Interfaces:**
- Keeps: `Vault.create`, `Vault.unlock`, `Vault.save`, `Vault.data`.
- Produces: `changePassword(current: string, next: string): Promise<void>`.
- Produces errors (exact English messages, mapped later by the UI):
  - `current password is incorrect`
  - `new password must differ from current password`
- After success, later `save()` calls use the new key and salt.
- After failure, disk and in-memory key still match the old password.

- [ ] **Step 1: Write failing Vault tests**

Append to `tests/vault.test.ts`:

```ts
describe('Vault.changePassword', () => {
  it('rejects a wrong current password and leaves the file unchanged', async () => {
    const { dir, file } = await tmpFile();
    try {
      const vault = await Vault.create(file, 'old-pass', { n: 1 });
      await expect(vault.changePassword('nope', 'new-pass')).rejects.toThrow(
        /current password is incorrect/,
      );
      const reloaded = await Vault.unlock<{ n: number }>(file, 'old-pass');
      expect(reloaded.data).toEqual({ n: 1 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('re-encrypts so only the new password unlocks the same data', async () => {
    const { dir, file } = await tmpFile();
    try {
      const vault = await Vault.create(file, 'old-pass', { n: 7 });
      await vault.changePassword('old-pass', 'new-pass');
      await expect(Vault.unlock(file, 'old-pass')).rejects.toThrow();
      const reloaded = await Vault.unlock<{ n: number }>(file, 'new-pass');
      expect(reloaded.data).toEqual({ n: 7 });
      vault.data = { n: 8 };
      await vault.save();
      const afterSave = await Vault.unlock<{ n: number }>(file, 'new-pass');
      expect(afterSave.data).toEqual({ n: 8 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a new password equal to the current password', async () => {
    const { dir, file } = await tmpFile();
    try {
      const vault = await Vault.create(file, 'same-pass', { n: 1 });
      await expect(vault.changePassword('same-pass', 'same-pass')).rejects.toThrow(
        /new password must differ from current password/,
      );
      const reloaded = await Vault.unlock<{ n: number }>(file, 'same-pass');
      expect(reloaded.data).toEqual({ n: 1 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps the old key when persist fails', async () => {
    const { dir, file } = await tmpFile();
    const blocker = `${file}.tmp`;
    try {
      const vault = await Vault.create(file, 'old-pass', { n: 1 });
      const { mkdir } = await import('node:fs/promises');
      await mkdir(blocker);
      await expect(vault.changePassword('old-pass', 'new-pass')).rejects.toThrow();
      const reloaded = await Vault.unlock<{ n: number }>(file, 'old-pass');
      expect(reloaded.data).toEqual({ n: 1 });
      await expect(Vault.unlock(file, 'new-pass')).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
npx vitest run tests/vault.test.ts
```

Expected: FAIL because `changePassword` is not defined.

- [ ] **Step 3: Implement changePassword and shared persist**

Replace `src/vault/vault.ts` with:

```ts
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { deriveKey } from '../crypto/kdf.js';
import { encrypt, decrypt } from '../crypto/aead.js';
import { packFile, unpackFile } from './format.js';

export class Vault<T = unknown> {
  private constructor(
    private readonly file: string,
    private key: Buffer,
    private salt: Buffer,
    public data: T,
  ) {}

  static async create<T>(file: string, password: string, initial: T): Promise<Vault<T>> {
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt);
    const cloned = JSON.parse(JSON.stringify(initial)) as T;
    const v = new Vault<T>(file, key, salt, cloned);
    await v.save();
    return v;
  }

  static async unlock<T>(file: string, password: string): Promise<Vault<T>> {
    const blob = await readFile(file);
    const { salt, iv, ciphertext } = unpackFile(blob);
    const key = await deriveKey(password, salt);
    const plaintext = decrypt(key, iv, ciphertext);
    const data = JSON.parse(plaintext.toString('utf8')) as T;
    return new Vault<T>(file, key, salt, data);
  }

  async save(): Promise<void> {
    await this.persist(this.key, this.salt);
  }

  async changePassword(current: string, next: string): Promise<void> {
    if (next === current) {
      throw new Error('new password must differ from current password');
    }
    const candidate = await deriveKey(current, this.salt);
    if (!sameKey(candidate, this.key)) {
      throw new Error('current password is incorrect');
    }
    const salt = randomBytes(16);
    const key = await deriveKey(next, salt);
    await this.persist(key, salt);
    this.key = key;
    this.salt = salt;
  }

  private async persist(key: Buffer, salt: Buffer): Promise<void> {
    const iv = randomBytes(12);
    const pt = Buffer.from(JSON.stringify(this.data), 'utf8');
    const ct = encrypt(key, iv, pt);
    const blob = packFile(salt, iv, ct);
    const tmp = `${this.file}.tmp`;
    const fh = await open(tmp, 'w', 0o600);
    try {
      await fh.writeFile(blob);
      await fh.sync();
    } finally {
      await fh.close();
    }
    await rename(tmp, this.file);
  }
}

function sameKey(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
```

- [ ] **Step 4: Run Vault tests and build**

Run:

```bash
npx vitest run tests/vault.test.ts
npx tsc -p .
```

Expected: Vault tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/vault/vault.ts tests/vault.test.ts
git commit -m "feat(vault): re-encrypt vault on password change"
```

---

### Task 2: ChangePasswordScreen

**Files:**
- Create: `src/ui/screens/ChangePasswordScreen.tsx`
- Create: `tests/ui/changePasswordScreen.test.tsx`

**Interfaces:**
- Produces: `ChangePasswordScreen({ onSave, onCancel })`.
- Produces: `onSave(current: string, next: string): Promise<void>`.
- Produces: `onCancel(): void`.
- Consumes later: App will pass `vault.changePassword` through `onSave`.
- Maps `error.message` containing `current password is incorrect` to `当前主密码错误，请重试` and clears the current field.
- Any other thrown error becomes `更改主密码失败，请重试` and keeps input.

- [ ] **Step 1: Write failing screen tests**

Create `tests/ui/changePasswordScreen.test.tsx`:

```tsx
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ChangePasswordScreen } from '../../src/ui/screens/ChangePasswordScreen.js';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

async function fill(
  stdin: { write: (value: string) => void },
  current: string,
  next: string,
  confirm: string,
) {
  await flush();
  stdin.write(current);
  await flush();
  stdin.write('\t');
  await flush();
  stdin.write(next);
  await flush();
  stdin.write('\t');
  await flush();
  stdin.write(confirm);
  await flush();
}

describe('ChangePasswordScreen', () => {
  it('uses Chinese labels and required marks', () => {
    const { lastFrame } = render(
      <ChangePasswordScreen onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('更改主密码');
    expect(frame).toContain('当前主密码 *');
    expect(frame).toContain('新主密码 *');
    expect(frame).toContain('再次输入 *');
  });

  it('requires the current password', async () => {
    const { stdin, lastFrame } = render(
      <ChangePasswordScreen onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    await flush();
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('请输入当前主密码');
    expect(lastFrame()).toContain('› 当前主密码');
  });

  it('rejects a short new password', async () => {
    const { stdin, lastFrame } = render(
      <ChangePasswordScreen onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    await fill(stdin, 'old-pass', 'abc', 'abc');
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('主密码至少需要 4 个字符');
  });

  it('rejects mismatched confirmation', async () => {
    const { stdin, lastFrame } = render(
      <ChangePasswordScreen onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    await fill(stdin, 'old-pass', 'new-pass', 'new-passx');
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('两次输入的主密码不一致');
  });

  it('rejects a new password equal to the current password', async () => {
    const { stdin, lastFrame } = render(
      <ChangePasswordScreen onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    await fill(stdin, 'same-pass', 'same-pass', 'same-pass');
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('新主密码不能与当前主密码相同');
  });

  it('locks duplicate submits while onSave is pending', async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn(
      () => new Promise<void>((resolve) => { resolveSave = resolve; }),
    );
    const { stdin, lastFrame } = render(
      <ChangePasswordScreen onSave={onSave} onCancel={vi.fn()} />,
    );
    await fill(stdin, 'old-pass', 'new-pass', 'new-pass');
    stdin.write('\x13');
    await flush();
    stdin.write('\x13');
    await flush();
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith('old-pass', 'new-pass');
    expect(lastFrame()).toContain('正在更改主密码…');
    resolveSave();
  });

  it('clears the current password after a wrong-password error', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('current password is incorrect');
    });
    const { stdin, lastFrame } = render(
      <ChangePasswordScreen onSave={onSave} onCancel={vi.fn()} />,
    );
    await fill(stdin, 'wrong', 'new-pass', 'new-pass');
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('当前主密码错误，请重试');
    expect(lastFrame()).toContain('› 当前主密码');
    expect(lastFrame()).not.toContain('•••••');
  });

  it('keeps input after a generic save failure', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('disk');
    });
    const { stdin, lastFrame } = render(
      <ChangePasswordScreen onSave={onSave} onCancel={vi.fn()} />,
    );
    await fill(stdin, 'old-pass', 'new-pass', 'new-pass');
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('更改主密码失败，请重试');
    expect(lastFrame()).toContain('••••••••');
  });

  it('cancels with Esc without calling onSave', async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const { stdin } = render(
      <ChangePasswordScreen onSave={onSave} onCancel={onCancel} />,
    );
    await flush();
    stdin.write('\u001b');
    await flush();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the screen tests and verify failure**

Run:

```bash
npx vitest run tests/ui/changePasswordScreen.test.tsx
```

Expected: FAIL because `ChangePasswordScreen` does not exist.

- [ ] **Step 3: Implement ChangePasswordScreen**

Create `src/ui/screens/ChangePasswordScreen.tsx`:

```tsx
import React, { useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

const FIELDS = ['current', 'next', 'confirm'] as const;
type Field = (typeof FIELDS)[number];
type FormValues = Record<Field, string>;
type FormError = { field?: Field; message: string };

const HELP =
  'Tab/Shift+Tab 切换   Enter 下一项   Ctrl+S 保存   ' +
  'Ctrl+R 显示密码   Esc 取消';

function validate(values: FormValues): FormError | null {
  if (values.current === '') {
    return { field: 'current', message: '请输入当前主密码' };
  }
  if (values.next.length < 4) {
    return { field: 'next', message: '主密码至少需要 4 个字符' };
  }
  if (values.next !== values.confirm) {
    return { field: 'confirm', message: '两次输入的主密码不一致' };
  }
  if (values.next === values.current) {
    return { field: 'next', message: '新主密码不能与当前主密码相同' };
  }
  return null;
}

function saveError(error: unknown): FormError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('current password is incorrect')) {
    return { field: 'current', message: '当前主密码错误，请重试' };
  }
  return { message: '更改主密码失败，请重试' };
}

export function ChangePasswordScreen({
  onSave,
  onCancel,
}: {
  onSave: (current: string, next: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<FormValues>({
    current: '',
    next: '',
    confirm: '',
  });
  const [focus, setFocus] = useState<Field>('current');
  const [error, setError] = useState<FormError | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const shortcutRef = useRef(false);
  const [showPw, setShowPw] = useState(false);

  const moveFocus = (dir: 1 | -1) => {
    const idx = FIELDS.indexOf(focus);
    setFocus(FIELDS[(idx + dir + FIELDS.length) % FIELDS.length]);
  };

  const markShortcut = () => {
    shortcutRef.current = true;
    queueMicrotask(() => {
      shortcutRef.current = false;
    });
  };

  const trySave = async () => {
    if (savingRef.current) return;
    const validationError = validate(values);
    if (validationError) {
      setError(validationError);
      if (validationError.field) setFocus(validationError.field);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(values.current, values.next);
    } catch (caught) {
      const nextError = saveError(caught);
      if (nextError.field === 'current') {
        setValues((current) => ({ ...current, current: '' }));
      }
      setError(nextError);
      if (nextError.field) setFocus(nextError.field);
      savingRef.current = false;
      setSaving(false);
    }
  };

  useInput((input, key) => {
    if (savingRef.current || saving) return;
    if (key.escape) onCancel();
    else if (key.ctrl && input === 's') {
      markShortcut();
      void trySave();
    } else if (key.ctrl && input === 'r') {
      markShortcut();
      setShowPw((visible) => !visible);
    } else if (key.tab && key.shift) moveFocus(-1);
    else if (key.tab) moveFocus(1);
  });

  const row = (field: Field, label: string) => {
    const focused = focus === field;
    const displayLabel = `${focused ? '›' : ' '} ${label} *:`;
    const mask = showPw ? undefined : '•';
    return (
      <Box key={field}>
        <Text color={focused ? 'cyan' : undefined}>
          {displayLabel.padEnd(16)}
        </Text>
        {focused ? (
          <TextInput
            value={values[field]}
            onChange={(value) => {
              if (shortcutRef.current) {
                shortcutRef.current = false;
                return;
              }
              if (savingRef.current) return;
              setValues((current) => ({ ...current, [field]: value }));
              if (error?.field === field) setError(null);
            }}
            onSubmit={() => {
              if (field === 'confirm') void trySave();
              else moveFocus(1);
            }}
            mask={mask}
            focus={!saving}
          />
        ) : (
          <Text>{mask ? mask.repeat(values[field].length) : values[field]}</Text>
        )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>更改主密码</Text>
      <Box flexDirection="column" marginTop={1}>
        {row('current', '当前主密码')}
        {row('next', '新主密码')}
        {row('confirm', '再次输入')}
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">{error.message}</Text>
        </Box>
      )}
      {saving && (
        <Box marginTop={1}>
          <Text color="yellow">正在更改主密码…</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="gray">{HELP}</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run screen tests and build**

Run:

```bash
npx vitest run tests/ui/changePasswordScreen.test.tsx
npx tsc -p .
```

Expected: screen tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/ChangePasswordScreen.tsx tests/ui/changePasswordScreen.test.tsx
git commit -m "feat(ui): add change master password screen"
```

---

### Task 3: List shortcut, App route, and success notice

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/screens/ListScreen.tsx`
- Modify: `tests/ui/listScreen.test.tsx`

**Interfaces:**
- Consumes: `ChangePasswordScreen` from Task 2.
- Consumes: `vault.changePassword(current: string, next: string): Promise<void>` from Task 1 via `useServices().vault`.
- Changes `ListScreen` props to:
  - `onChangePassword: () => void`
  - `notice?: string | null`
  - `onClearNotice?: () => void`
- Produces App route `{ kind: 'change-password' }`.
- Success copy (exact): `主密码已更改`.
- Footer secondary item (exact): `{ key: 'c', label: '更改主密码' }`.

- [ ] **Step 1: Write failing list tests**

In every existing `ListScreen` JSX in `tests/ui/listScreen.test.tsx`, add `onChangePassword={vi.fn()}` so TypeScript compiles once the prop exists. There are currently nine `onDelete={...}` call sites; each sibling `ListScreen` needs the new prop.

In the 80-column host-list test, after `expect(frame).toContain('查看密码');` add:

```tsx
expect(frame).toContain('更改主密码');
```

Then add:

```tsx
it('opens change-password from c and shows the footer hint', async () => {
  const onChangePassword = vi.fn();
  const { stdin, lastFrame } = render(
    <ListScreen
      hosts={hosts}
      onConnect={vi.fn()}
      onAdd={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onChangePassword={onChangePassword}
    />,
  );
  expect(lastFrame()).toContain('更改主密码');
  await flush();
  stdin.write('c');
  await flush();
  expect(onChangePassword).toHaveBeenCalledOnce();
});

it('does not open change-password while an overlay is open', async () => {
  const onChangePassword = vi.fn();
  const { stdin } = render(
    <ListScreen
      hosts={hosts}
      onConnect={vi.fn()}
      onAdd={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onChangePassword={onChangePassword}
    />,
  );
  await flush();
  stdin.write('p');
  await flush();
  stdin.write('c');
  await flush();
  expect(onChangePassword).not.toHaveBeenCalled();
});

it('clears the success notice on the next list key', async () => {
  const onClearNotice = vi.fn();
  const { stdin, lastFrame } = render(
    <ListScreen
      hosts={hosts}
      onConnect={vi.fn()}
      onAdd={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onChangePassword={vi.fn()}
      notice="主密码已更改"
      onClearNotice={onClearNotice}
    />,
  );
  expect(lastFrame()).toContain('主密码已更改');
  await flush();
  stdin.write('j');
  await flush();
  expect(onClearNotice).toHaveBeenCalledOnce();
});
```

Update 80-column assertions that list footer copy so they still expect `更改主密码` to be fully visible if those tests enumerate secondary hints.

- [ ] **Step 2: Run list tests and verify failure**

Run:

```bash
npx vitest run tests/ui/listScreen.test.tsx
```

Expected: FAIL because `c` is ignored and the footer lacks `更改主密码`.

- [ ] **Step 3: Wire ListScreen**

Update `src/ui/screens/ListScreen.tsx` props:

```tsx
interface Props {
  hosts: Host[];
  onConnect: (h: Host) => void;
  onAdd: () => void;
  onEdit: (h: Host) => void;
  onDelete: (h: Host) => Promise<void>;
  onChangePassword: () => void;
  notice?: string | null;
  onClearNotice?: () => void;
}
```

Add `onChangePassword`, `notice = null`, and `onClearNotice` to the function arguments.

At the top of the list `useInput` handler, after the overlay early returns and before movement keys:

```tsx
if (notice) onClearNotice?.();
```

Do not return after clearing; the same key still performs its normal list action.

Add `else if (input === 'c') onChangePassword();` with the other letter shortcuts.

Add `{ key: 'c', label: '更改主密码' }` to the normal-list `secondary` array, after `p` and before `q`.

After the header `Box`, if `notice` is set, render:

```tsx
{notice && (
  <Box paddingX={1}>
    <Text color="green">{notice}</Text>
  </Box>
)}
```

- [ ] **Step 4: Wire App**

In `src/ui/App.tsx`:

```tsx
import { ChangePasswordScreen } from './screens/ChangePasswordScreen.js';

type Route =
  | { kind: 'list' }
  | { kind: 'add' }
  | { kind: 'edit'; host: Host }
  | { kind: 'change-password' };

export function App({ onConnect }: Props) {
  const { repo, vault } = useServices();
  const [route, setRoute] = useState<Route>({ kind: 'list' });
  const [notice, setNotice] = useState<string | null>(null);
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);

  if (route.kind === 'change-password') {
    return (
      <ChangePasswordScreen
        onCancel={() => setRoute({ kind: 'list' })}
        onSave={async (current, next) => {
          await vault.changePassword(current, next);
          setNotice('主密码已更改');
          setRoute({ kind: 'list' });
        }}
      />
    );
  }

  // existing add/edit branches unchanged

  return (
    <ListScreen
      hosts={repo.list()}
      onConnect={onConnect}
      onAdd={() => setRoute({ kind: 'add' })}
      onEdit={(h) => setRoute({ kind: 'edit', host: h })}
      onDelete={async (h) => {
        await repo.remove(h.id);
        refresh();
      }}
      onChangePassword={() => setRoute({ kind: 'change-password' })}
      notice={notice}
      onClearNotice={() => setNotice(null)}
    />
  );
}
```

Keep the existing add/edit branches exactly as they are.

- [ ] **Step 5: Run focused tests and build**

Run:

```bash
npx vitest run tests/ui/listScreen.test.tsx tests/ui/changePasswordScreen.test.tsx tests/vault.test.ts
npx tsc -p .
```

Expected: those files PASS and TypeScript exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/ui/App.tsx src/ui/screens/ListScreen.tsx tests/ui/listScreen.test.tsx
git commit -m "feat(ui): open master password change from the list"
```

---

### Task 4: Documentation and full verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- No runtime interface changes.
- Documents `c` as changing the master password.

- [ ] **Step 1: Update README shortcuts**

In `README.md`, add this line to “主界面快捷键”, after `p` and before `q`:

```markdown
- `c`：更改主密码
```

After the form-shortcut paragraph, add:

```markdown
更改主密码时，先输入当前主密码，再输入并确认新主密码。`Esc` 取消。
```

- [ ] **Step 2: Run the complete test suite**

Run:

```bash
npx vitest run
```

Expected: all test files PASS with zero failures.

- [ ] **Step 3: Run the production build**

Run:

```bash
npx tsc -p .
```

Expected: TypeScript exits 0.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document master password change"
```

---
