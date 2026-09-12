import React, { useRef, useState } from 'react';
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
  const confirmLock = useRef(false);

  const confirm = async () => {
    if (confirmLock.current) return;
    confirmLock.current = true;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch {
      confirmLock.current = false;
      setError('删除失败，请重试');
      setBusy(false);
    }
  };

  useInput((input, key) => {
    if (busy || confirmLock.current) return;
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
