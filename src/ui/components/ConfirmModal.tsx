import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export function ConfirmModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [focus, setFocus] = useState<'cancel' | 'ok'>('cancel');

  useInput((input, key) => {
    if (key.leftArrow || key.rightArrow || input === 'h' || input === 'l' || key.tab) {
      setFocus((f) => (f === 'cancel' ? 'ok' : 'cancel'));
    } else if (key.return) {
      focus === 'ok' ? onConfirm() : onCancel();
    } else if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>{message}</Text>
      <Box marginTop={1} gap={2}>
        <Text inverse={focus === 'cancel'}>[ 取消 ]</Text>
        <Text inverse={focus === 'ok'}>[ 删除 ]</Text>
      </Box>
    </Box>
  );
}
