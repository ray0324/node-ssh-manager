import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

export function UnlockScreen({
  onSubmit,
}: {
  onSubmit: (password: string) => Promise<void>;
}) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    try {
      await onSubmit(pw);
    } catch (e: any) {
      setErr('主密码错误,请重试');
      setPw('');
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>解锁 sshm</Text>
      <Box marginTop={1}>
        <Text>主密码: </Text>
        <TextInput value={pw} onChange={setPw} onSubmit={submit} mask="•" />
      </Box>
      {err && (
        <Box marginTop={1}>
          <Text color="red">{err}</Text>
        </Box>
      )}
    </Box>
  );
}
