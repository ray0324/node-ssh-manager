# sshm CLI Interaction Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the existing sshm TUI with consistent Simplified Chinese copy, clearer focus and key hints, safe modal behavior, and visible asynchronous feedback.

**Architecture:** Keep the current `App` routing and `Screen → App → HostRepo → Vault` data flow. Give each screen ownership of its transient focus, validation, modal, and busy state; keep presentational components stateless except for `ConfirmModal`, which owns its confirmation lifecycle.

**Tech Stack:** Node.js 20+, TypeScript 5, React 18, Ink 5, ink-text-input 6, Vitest 1, ink-testing-library 4.

## Global Constraints

- Do not change the vault format, host data model, repository API, or SSH connection flow.
- Do not add dependencies.
- Do not add search, sorting, grouping, detail panels, mouse support, or theming.
- Use Simplified Chinese for all user-facing copy, including host field labels.
- Target a standard 80-column terminal; no special layout is required below 80 columns.
- Keep the current keyboard shortcuts and component-to-component callback flow.

Spec: `docs/superpowers/specs/2026-09-12-cli-interaction-polish-design.md`

---

## File Structure

- Modify `src/ui/components/Footer.tsx`: render structured, consistently styled shortcut groups.
- Modify `src/ui/components/HostList.tsx`: render the selected row and empty state.
- Modify `src/ui/components/ConfirmModal.tsx`: own confirmation focus, busy state, and failure feedback.
- Modify `src/ui/screens/ListScreen.tsx`: coordinate list input, overlays, deletion, and contextual footer hints.
- Modify `src/ui/screens/HostFormScreen.tsx`: own field validation, navigation, saving, and translated errors.
- Modify `src/ui/screens/InitScreen.tsx`: add Chinese validation and guarded asynchronous submission.
- Modify `src/ui/screens/UnlockScreen.tsx`: add guarded asynchronous submission and retry feedback.
- Modify `README.md`: document the password shortcut and polished interaction behavior.
- Create `tests/ui/footer.test.tsx`: verify structured shortcut rendering.
- Modify `tests/ui/listScreen.test.tsx`: verify list navigation, overlays, and deletion.
- Create `tests/ui/confirmModal.test.tsx`: verify safe defaults and asynchronous confirmation.
- Create `tests/ui/hostFormScreen.test.tsx`: verify form validation, navigation, and submit locking.
- Create `tests/ui/authScreens.test.tsx`: verify initialization and unlock states.

## Test Convention

UI tests that need React state to settle use:

```tsx
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
```

After each `stdin.write(...)`, call `await flush()` before inspecting the frame or mock calls.

---

### Task 1: Structured Footer and Host List Presentation

**Files:**
- Create: `tests/ui/footer.test.tsx`
- Modify: `tests/ui/listScreen.test.tsx`
- Modify: `src/ui/components/Footer.tsx`
- Modify: `src/ui/components/HostList.tsx`
- Modify: `src/ui/screens/ListScreen.tsx`

**Interfaces:**
- Produces: `FooterHint = { key: string; label: string }`.
- Produces: `Footer({ primary, secondary? }: { primary: FooterHint[]; secondary?: FooterHint[] })`.
- Keeps: `HostList({ hosts, selectedId }: { hosts: Host[]; selectedId: string | null })`.

- [ ] **Step 1: Write failing footer and list presentation tests**

Create `tests/ui/footer.test.tsx`:

```tsx
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
```

Add these assertions to the rendering test in `tests/ui/listScreen.test.tsx`:

```tsx
expect(frame).toContain('sshm · SSH 主机管理器');
expect(frame).toContain('1 台主机');
expect(frame).toContain('›');
expect(frame).toContain('Enter');
expect(frame).toContain('连接');
```

Add an empty-state test:

```tsx
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
```

Add a navigation test using a second host:

```tsx
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
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
pnpm vitest run tests/ui/footer.test.tsx tests/ui/listScreen.test.tsx
```

Expected: FAIL because `Footer` does not accept structured groups and the new Chinese copy is absent.

- [ ] **Step 3: Implement the structured footer**

Replace `src/ui/components/Footer.tsx` with:

```tsx
import React from 'react';
import { Box, Text } from 'ink';

export interface FooterHint {
  key: string;
  label: string;
}

interface Props {
  primary: FooterHint[];
  secondary?: FooterHint[];
}

function HintRow({ hints }: { hints: FooterHint[] }) {
  return (
    <Box gap={2}>
      {hints.map((hint) => (
        <Box key={`${hint.key}-${hint.label}`}>
          <Text bold color="cyan">
            {hint.key}
          </Text>
          <Text color="gray"> {hint.label}</Text>
        </Box>
      ))}
    </Box>
  );
}

export function Footer({ primary, secondary = [] }: Props) {
  return (
    <Box
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
      flexDirection="column"
    >
      <HintRow hints={primary} />
      {secondary.length > 0 && <HintRow hints={secondary} />}
    </Box>
  );
}
```

- [ ] **Step 4: Implement host-list presentation and update the static list footer**

Replace the empty state and row body in `src/ui/components/HostList.tsx` with:

```tsx
if (hosts.length === 0) {
  return (
    <Box paddingX={1} paddingY={1}>
      <Text color="gray">还没有主机，按 </Text>
      <Text bold color="cyan">a</Text>
      <Text color="gray"> 添加第一台主机</Text>
    </Box>
  );
}

return (
  <Box flexDirection="column" paddingX={1} paddingY={1}>
    {hosts.map((host) => {
      const selected = host.id === selectedId;
      return (
        <Text
          key={host.id}
          inverse={selected}
          color={selected ? 'cyan' : undefined}
        >
          {selected ? '› ' : '  '}
          {host.alias.padEnd(20)} {host.user}@{host.host}:{host.port}
        </Text>
      );
    })}
  </Box>
);
```

In `src/ui/screens/ListScreen.tsx`, replace the header copy and existing footer call with:

```tsx
<Box borderStyle="round" paddingX={1}>
  <Text bold>sshm · SSH 主机管理器</Text>
  <Box flexGrow={1} />
  <Text color="gray">{hosts.length} 台主机</Text>
</Box>
<HostList hosts={hosts} selectedId={selected?.id ?? null} />
<Footer
  primary={[
    { key: '↑↓/jk', label: '选择' },
    { key: 'Enter', label: '连接' },
    { key: 'a', label: '添加' },
    { key: 'e', label: '编辑' },
  ]}
  secondary={[
    { key: 'd', label: '删除' },
    { key: 'p', label: '查看密码' },
    { key: 'q', label: '退出' },
  ]}
/>
```

- [ ] **Step 5: Run tests and build**

Run:

```bash
pnpm vitest run tests/ui/footer.test.tsx tests/ui/listScreen.test.tsx
pnpm build
```

Expected: both test files PASS and TypeScript exits with code 0.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/Footer.tsx src/ui/components/HostList.tsx src/ui/screens/ListScreen.tsx tests/ui/footer.test.tsx tests/ui/listScreen.test.tsx
git commit -m "feat(ui): polish list presentation"
```

---

### Task 2: Contextual List Overlays and Safe Deletion

**Files:**
- Create: `tests/ui/confirmModal.test.tsx`
- Modify: `tests/ui/listScreen.test.tsx`
- Modify: `src/ui/components/ConfirmModal.tsx`
- Modify: `src/ui/screens/ListScreen.tsx`

**Interfaces:**
- Changes: `ConfirmModal.onConfirm` from `() => void` to `() => Promise<void>`.
- Keeps: `ConfirmModal.onCancel: () => void`.
- Produces: modal-owned `busy` and `error` states.
- Consumes: the structured `Footer` interface from Task 1.

- [ ] **Step 1: Write failing confirmation tests**

Create `tests/ui/confirmModal.test.tsx`:

```tsx
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ConfirmModal } from '../../src/ui/components/ConfirmModal.js';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('ConfirmModal', () => {
  it('defaults to cancel and submits the focused action', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn(async () => {});
    const { stdin } = render(
      <ConfirmModal message="确认删除？" onConfirm={onConfirm} onCancel={onCancel} />,
    );

    stdin.write('\r');
    await flush();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('locks repeated confirmation while deletion is pending', async () => {
    let resolveDelete!: () => void;
    const onConfirm = vi.fn(
      () => new Promise<void>((resolve) => { resolveDelete = resolve; }),
    );
    const { stdin, lastFrame } = render(
      <ConfirmModal message="确认删除？" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );

    stdin.write('\t');
    stdin.write('\r');
    await flush();
    stdin.write('\r');
    await flush();

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(lastFrame()).toContain('正在删除…');
    resolveDelete();
  });

  it('keeps the modal open and reports failure', async () => {
    const { stdin, lastFrame } = render(
      <ConfirmModal
        message="确认删除？"
        onConfirm={vi.fn(async () => { throw new Error('disk'); })}
        onCancel={vi.fn()}
      />,
    );

    stdin.write('\t');
    stdin.write('\r');
    await flush();
    expect(lastFrame()).toContain('删除失败，请重试');
  });
});
```

Add tests to `tests/ui/listScreen.test.tsx` for overlay input isolation:

```tsx
it('does not pass the password-close key through to list actions', async () => {
  const onAdd = vi.fn();
  const { stdin, lastFrame } = render(
    <ListScreen
      hosts={hosts}
      onConnect={vi.fn()}
      onAdd={onAdd}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );

  await flush();
  stdin.write('p');
  await flush();
  expect(lastFrame()).toContain('敏感信息 · prod-web-1');
  expect(lastFrame()).toContain('x');
  stdin.write('a');
  await flush();
  expect(onAdd).not.toHaveBeenCalled();
});

it('deletes once and closes confirmation after success', async () => {
  const onDelete = vi.fn(async () => {});
  const { stdin, lastFrame } = render(
    <ListScreen
      hosts={hosts}
      onConnect={vi.fn()}
      onAdd={vi.fn()}
      onEdit={vi.fn()}
      onDelete={onDelete}
    />,
  );

  await flush();
  stdin.write('d');
  await flush();
  stdin.write('\t');
  stdin.write('\r');
  await flush();
  expect(onDelete).toHaveBeenCalledOnce();
  expect(lastFrame()).not.toContain('确认删除');
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
pnpm vitest run tests/ui/confirmModal.test.tsx tests/ui/listScreen.test.tsx
```

Expected: FAIL because confirmation has no busy/error handling and list footer/overlay behavior is static.

- [ ] **Step 3: Implement asynchronous confirmation state**

Replace `src/ui/components/ConfirmModal.tsx` with:

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface Props {
  message: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function ConfirmModal({ message, onConfirm, onCancel }: Props) {
  const [focus, setFocus] = useState<'cancel' | 'ok'>('cancel');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch {
      setError('删除失败，请重试');
      setBusy(false);
    }
  };

  useInput((input, key) => {
    if (busy) return;
    if (key.leftArrow || key.rightArrow || input === 'h' || input === 'l' || key.tab) {
      setFocus((current) => (current === 'cancel' ? 'ok' : 'cancel'));
    } else if (key.return) {
      if (focus === 'ok') void confirm();
      else onCancel();
    } else if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>{message}</Text>
      <Box marginTop={1} gap={2}>
        <Text inverse={!busy && focus === 'cancel'}>[ 取消 ]</Text>
        <Text inverse={!busy && focus === 'ok'}>[ 删除 ]</Text>
      </Box>
      {busy && <Text color="yellow">正在删除…</Text>}
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}
```

- [ ] **Step 4: Make list overlays contextual and clamp the cursor**

In `src/ui/screens/ListScreen.tsx`, add cursor clamping:

```tsx
import React, { useEffect, useState } from 'react';

useEffect(() => {
  setCursor((current) => Math.min(current, Math.max(hosts.length - 1, 0)));
}, [hosts.length]);
```

Define contextual hints before the return:

```tsx
const footer = pendingDelete
  ? {
      primary: [
        { key: '←→/Tab', label: '选择' },
        { key: 'Enter', label: '确认' },
        { key: 'Esc', label: '取消' },
      ],
      secondary: [],
    }
  : reveal
    ? {
        primary: [{ key: '任意键/Esc', label: '关闭密码' }],
        secondary: [],
      }
    : {
        primary: [
          { key: '↑↓/jk', label: '选择' },
          { key: 'Enter', label: '连接' },
          { key: 'a', label: '添加' },
          { key: 'e', label: '编辑' },
        ],
        secondary: [
          { key: 'd', label: '删除' },
          { key: 'p', label: '查看密码' },
          { key: 'q', label: '退出' },
        ],
      };
```

Render `<Footer primary={footer.primary} secondary={footer.secondary} />`. Replace the modal callback and password panel with:

```tsx
{pendingDelete && (
  <ConfirmModal
    message={`确认删除“${pendingDelete.alias}”？`}
    onConfirm={async () => {
      await onDelete(pendingDelete);
      setPendingDelete(null);
      setCursor((current) =>
        Math.min(current, Math.max(hosts.length - 2, 0)),
      );
    }}
    onCancel={() => setPendingDelete(null)}
  />
)}
{reveal && (
  <Box marginTop={1} borderStyle="round" paddingX={1} flexDirection="column">
    <Text bold color="yellow">敏感信息 · {reveal.alias}</Text>
    <Text>{reveal.password}</Text>
    <Text color="gray">按任意键或 Esc 关闭</Text>
  </Box>
)}
```

Keep the existing early returns in `useInput`: the parent list hook returns when a modal is open, so the key consumed by an overlay cannot trigger a list action.

- [ ] **Step 5: Run focused tests and build**

Run:

```bash
pnpm vitest run tests/ui/confirmModal.test.tsx tests/ui/listScreen.test.tsx
pnpm build
```

Expected: both test files PASS and TypeScript exits with code 0.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/ConfirmModal.tsx src/ui/screens/ListScreen.tsx tests/ui/confirmModal.test.tsx tests/ui/listScreen.test.tsx
git commit -m "feat(ui): add safe contextual list overlays"
```

---

### Task 3: Validated and Guarded Host Form

**Files:**
- Create: `tests/ui/hostFormScreen.test.tsx`
- Modify: `src/ui/screens/HostFormScreen.tsx`

**Interfaces:**
- Keeps: `HostFormScreen({ initial?, onSave, onCancel })`.
- Produces internally: `FormError = { field?: Field; message: string }`.
- Keeps: `onSave(input: HostInput): Promise<void>`.

- [ ] **Step 1: Write failing form behavior tests**

Create `tests/ui/hostFormScreen.test.tsx`:

```tsx
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { HostFormScreen } from '../../src/ui/screens/HostFormScreen.js';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('HostFormScreen', () => {
  it('uses Chinese labels and marks required fields', () => {
    const { lastFrame } = render(
      <HostFormScreen onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('添加主机');
    expect(frame).toContain('别名 *');
    expect(frame).toContain('主机 *');
    expect(frame).toContain('密码 *');
  });

  it('shows and focuses the first missing required field', async () => {
    const { stdin, lastFrame } = render(
      <HostFormScreen onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('请输入别名');
  });

  it('rejects an invalid port in Chinese', async () => {
    const { stdin, lastFrame } = render(
      <HostFormScreen onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    stdin.write('demo\tserver\t0');
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('端口必须是 1–65535 之间的整数');
  });

  it('supports forward and reverse field navigation', async () => {
    const { stdin, lastFrame } = render(
      <HostFormScreen onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    stdin.write('\t');
    await flush();
    expect(lastFrame()).toContain('› 主机');
    stdin.write('\u001b[Z');
    await flush();
    expect(lastFrame()).toContain('› 别名');
  });

  it('locks duplicate saves while onSave is pending', async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn(
      () => new Promise<void>((resolve) => { resolveSave = resolve; }),
    );
    const { stdin, lastFrame } = render(
      <HostFormScreen onSave={onSave} onCancel={vi.fn()} />,
    );

    stdin.write('demo\tserver\t');
    stdin.write('\troot\tsecret\tnote');
    stdin.write('\x13');
    await flush();
    stdin.write('\x13');
    await flush();

    expect(onSave).toHaveBeenCalledOnce();
    expect(lastFrame()).toContain('正在保存…');
    resolveSave();
  });

  it('translates duplicate alias failures and keeps input', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('alias "demo" already exists');
    });
    const { stdin, lastFrame } = render(
      <HostFormScreen onSave={onSave} onCancel={vi.fn()} />,
    );

    stdin.write('demo\tserver\t');
    stdin.write('\troot\tsecret\tnote');
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('该别名已存在');
    expect(lastFrame()).toContain('demo');
  });
});
```

- [ ] **Step 2: Run the form tests and verify failure**

Run:

```bash
pnpm vitest run tests/ui/hostFormScreen.test.tsx
```

Expected: FAIL because required-field validation, Chinese field labels, and save locking are missing.

- [ ] **Step 3: Add form validation and error translation**

In `src/ui/screens/HostFormScreen.tsx`, add:

```tsx
type FormValues = Record<Field, string>;
type FormError = { field?: Field; message: string };

const REQUIRED: Array<{ field: Field; message: string }> = [
  { field: 'alias', message: '请输入别名' },
  { field: 'host', message: '请输入主机地址' },
  { field: 'user', message: '请输入用户' },
  { field: 'password', message: '请输入密码' },
];

function validate(values: FormValues): FormError | null {
  for (const required of REQUIRED) {
    if (values[required.field].trim() === '') return required;
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { field: 'port', message: '端口必须是 1–65535 之间的整数' };
  }
  return null;
}

function saveError(error: unknown): FormError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('alias') && message.includes('already exists')) {
    return { field: 'alias', message: '该别名已存在' };
  }
  return { message: '保存失败，请重试' };
}
```

Replace the string error state with:

```tsx
const [error, setError] = useState<FormError | null>(null);
const [saving, setSaving] = useState(false);
```

Replace `trySave` with:

```tsx
const trySave = async () => {
  if (saving) return;
  const validationError = validate(values);
  if (validationError) {
    setError(validationError);
    if (validationError.field) setFocus(validationError.field);
    return;
  }

  setSaving(true);
  setError(null);
  try {
    await onSave({
      alias: values.alias.trim(),
      host: values.host.trim(),
      port: Number(values.port),
      user: values.user.trim(),
      password: values.password,
      note: values.note,
    });
  } catch (caught) {
    const nextError = saveError(caught);
    setError(nextError);
    if (nextError.field) setFocus(nextError.field);
    setSaving(false);
  }
};
```

Guard `useInput` with `if (saving) return;`, and call asynchronous saves with `void trySave()`.

- [ ] **Step 4: Update field rendering, labels, and feedback**

Replace the `row` callback with:

```tsx
const row = (field: Field, label: string, required = false, mask?: string) => {
  const focused = focus === field;
  const displayLabel = `${focused ? '›' : ' '} ${label}${required ? ' *' : ''}:`;
  return (
    <Box key={field}>
      <Text color={focused ? 'cyan' : undefined}>
        {displayLabel.padEnd(13)}
      </Text>
      {focused ? (
        <TextInput
          value={values[field]}
          onChange={(value) => {
            setValues((current) => ({ ...current, [field]: value }));
            if (error?.field === field) setError(null);
          }}
          onSubmit={() => {
            if (field === 'note') void trySave();
            else moveFocus(1);
          }}
          mask={mask}
        />
      ) : (
        <Text>{mask ? mask.repeat(values[field].length) : values[field]}</Text>
      )}
    </Box>
  );
};
```

Render fields and state as:

```tsx
{row('alias', '别名', true)}
{row('host', '主机', true)}
{row('port', '端口', true)}
{row('user', '用户', true)}
{row('password', '密码', true, showPw ? undefined : '•')}
{row('note', '备注')}

{error && (
  <Box marginTop={1}>
    <Text color="red">{error.message}</Text>
  </Box>
)}
{saving && (
  <Box marginTop={1}>
    <Text color="yellow">正在保存…</Text>
  </Box>
)}
<Box marginTop={1}>
  <Text color="gray">
    Tab/Shift+Tab 切换   Enter 下一项   Ctrl+S 保存   Ctrl+R 显示密码   Esc 取消
  </Text>
</Box>
```

- [ ] **Step 5: Run form tests and build**

Run:

```bash
pnpm vitest run tests/ui/hostFormScreen.test.tsx
pnpm build
```

Expected: form tests PASS and TypeScript exits with code 0.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/HostFormScreen.tsx tests/ui/hostFormScreen.test.tsx
git commit -m "feat(ui): improve host form feedback"
```

---

### Task 4: Guarded Initialization and Unlock Flows

**Files:**
- Create: `tests/ui/authScreens.test.tsx`
- Modify: `src/ui/screens/InitScreen.tsx`
- Modify: `src/ui/screens/UnlockScreen.tsx`

**Interfaces:**
- Keeps: `InitScreen.onSubmit(password: string): Promise<void>`.
- Keeps: `UnlockScreen.onSubmit(password: string): Promise<void>`.
- Produces: screen-local `submitting` state and consistent Chinese errors.

- [ ] **Step 1: Write failing authentication-screen tests**

Create `tests/ui/authScreens.test.tsx`:

```tsx
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { InitScreen } from '../../src/ui/screens/InitScreen.js';
import { UnlockScreen } from '../../src/ui/screens/UnlockScreen.js';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('InitScreen', () => {
  it('validates password length in Chinese', async () => {
    const { stdin, lastFrame } = render(
      <InitScreen onSubmit={vi.fn()} />,
    );
    stdin.write('abc\r');
    await flush();
    expect(lastFrame()).toContain('主密码至少需要 4 个字符');
  });

  it('blocks duplicate initialization submissions', async () => {
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn(
      () => new Promise<void>((resolve) => { resolveSubmit = resolve; }),
    );
    const { stdin, lastFrame } = render(<InitScreen onSubmit={onSubmit} />);
    stdin.write('abcd\r');
    await flush();
    stdin.write('abcd\r');
    await flush();
    stdin.write('\r');
    await flush();
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(lastFrame()).toContain('正在创建加密仓库…');
    resolveSubmit();
  });

  it('keeps valid input available after creation fails', async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error('disk');
    });
    const { stdin, lastFrame } = render(<InitScreen onSubmit={onSubmit} />);
    stdin.write('abcd\r');
    await flush();
    stdin.write('abcd\r');
    await flush();
    expect(lastFrame()).toContain('创建加密仓库失败，请重试');
    expect(lastFrame()).toContain('••••');
  });
});

describe('UnlockScreen', () => {
  it('clears a rejected password and allows retry', async () => {
    const onSubmit = vi
      .fn<(password: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('wrong'))
      .mockResolvedValueOnce();
    const { stdin, lastFrame } = render(<UnlockScreen onSubmit={onSubmit} />);

    stdin.write('bad\r');
    await flush();
    expect(lastFrame()).toContain('主密码错误，请重试');
    stdin.write('good\r');
    await flush();
    expect(onSubmit).toHaveBeenNthCalledWith(2, 'good');
  });

  it('shows a busy state and blocks duplicate unlocks', async () => {
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn(
      () => new Promise<void>((resolve) => { resolveSubmit = resolve; }),
    );
    const { stdin, lastFrame } = render(<UnlockScreen onSubmit={onSubmit} />);
    stdin.write('secret\r');
    await flush();
    stdin.write('\r');
    await flush();
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(lastFrame()).toContain('正在解锁…');
    resolveSubmit();
  });
});
```

- [ ] **Step 2: Run authentication tests and verify failure**

Run:

```bash
pnpm vitest run tests/ui/authScreens.test.tsx
```

Expected: FAIL because current screens have English validation and no submission lock or busy copy.

- [ ] **Step 3: Guard initialization submission**

In `src/ui/screens/InitScreen.tsx`, add:

```tsx
const [submitting, setSubmitting] = useState(false);
```

Replace the introductory copy with:

```tsx
<Text bold>欢迎使用 sshm · 设置主密码</Text>
<Text color="gray">
  主密码用于加密所有主机凭据，无法找回，请妥善保管。
</Text>
```

Use these handlers:

```tsx
const submitFirst = () => {
  if (submitting) return;
  if (pw.length < 4) {
    setErr('主密码至少需要 4 个字符');
    return;
  }
  setErr(null);
  setStage('confirm');
};

const submitConfirm = async () => {
  if (submitting) return;
  if (pw !== pw2) {
    setErr('两次输入的主密码不一致');
    setPw2('');
    return;
  }
  setSubmitting(true);
  setErr(null);
  try {
    await onSubmit(pw);
  } catch {
    setErr('创建加密仓库失败，请重试');
    setSubmitting(false);
  }
};
```

Set each active `TextInput` to `focus={!submitting}` and render:

```tsx
{submitting && <Text color="yellow">正在创建加密仓库…</Text>}
```

- [ ] **Step 4: Guard unlock submission**

In `src/ui/screens/UnlockScreen.tsx`, add:

```tsx
const [submitting, setSubmitting] = useState(false);
```

Replace `submit` with:

```tsx
const submit = async () => {
  if (submitting || pw.length === 0) return;
  setSubmitting(true);
  setErr(null);
  try {
    await onSubmit(pw);
  } catch {
    setErr('主密码错误，请重试');
    setPw('');
    setSubmitting(false);
  }
};
```

Set the password input to `focus={!submitting}` and render:

```tsx
{submitting && <Text color="yellow">正在解锁…</Text>}
```

- [ ] **Step 5: Run authentication tests and build**

Run:

```bash
pnpm vitest run tests/ui/authScreens.test.tsx
pnpm build
```

Expected: authentication tests PASS and TypeScript exits with code 0.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/InitScreen.tsx src/ui/screens/UnlockScreen.tsx tests/ui/authScreens.test.tsx
git commit -m "feat(ui): improve vault authentication feedback"
```

---

### Task 5: Documentation and Full Regression Verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- No runtime interface changes.
- Documents the existing `p` password-reveal shortcut and the final interaction model.

- [ ] **Step 1: Update the README shortcut documentation**

Replace the “主界面快捷键” list in `README.md` with:

```markdown
## 主界面快捷键

- `↑` / `↓` 或 `k` / `j`：上下移动
- `Enter`：连接选中主机
- `a`：新增主机
- `e`：编辑选中主机
- `d`：删除选中主机
- `p`：查看选中主机的密码
- `q`：退出

新增或编辑主机时，使用 `Tab` / `Shift+Tab` 切换字段、`Ctrl+S` 保存、
`Ctrl+R` 显示或隐藏密码、`Esc` 取消。
```

- [ ] **Step 2: Run the complete test suite**

Run:

```bash
pnpm test
```

Expected: all test files PASS with zero failed tests.

- [ ] **Step 3: Run the production build**

Run:

```bash
pnpm build
```

Expected: TypeScript exits with code 0 and emits `dist/`.

- [ ] **Step 4: Perform an 80-column manual smoke test**

Run:

```bash
COLUMNS=80 LINES=24 pnpm dev
```

Verify:

- Initialization or unlock copy is Chinese and submitting once shows a busy state.
- The list header, selected row, empty state, and two-row footer fit without important text truncation.
- Password and delete overlays replace the normal footer hints.
- Delete defaults to cancel and cannot submit twice while pending.
- Add/edit validation identifies the first bad field and saving cannot submit twice.
- `q` exits from the normal list.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update polished CLI controls"
```

- [ ] **Step 6: Confirm the worktree is clean**

Run:

```bash
git status --short
```

Expected: no output.
