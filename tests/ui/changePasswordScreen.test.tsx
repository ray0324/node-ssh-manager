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
    await fill(stdin, 'wrong', 'abcd', 'abcd');
    stdin.write('\x13');
    await flush();
    expect(lastFrame()).toContain('当前主密码错误，请重试');
    expect(lastFrame()).toContain('› 当前主密码');
    expect(lastFrame()).not.toContain('•••••');
    expect(lastFrame()).toContain('••••');
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
