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

    await flush();
    stdin.write('\r');
    await flush();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('locks repeated confirmation while deletion is pending', async () => {
    let resolveDelete!: () => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const { stdin, lastFrame } = render(
      <ConfirmModal message="确认删除？" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );

    await flush();
    stdin.write('\t');
    await flush();
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
        onConfirm={vi.fn(async () => {
          throw new Error('disk');
        })}
        onCancel={vi.fn()}
      />,
    );

    await flush();
    stdin.write('\t');
    await flush();
    stdin.write('\r');
    await flush();
    expect(lastFrame()).toContain('删除失败，请重试');
  });
});
