import React, { useRef, useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

function stripReturn(value: string): string {
  return value.replace(/\r/g, '');
}

export function UnlockScreen({
  onSubmit,
}: {
  onSubmit: (password: string) => Promise<void>;
}) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const submit = async (password: string) => {
    if (submittingRef.current || submitting || password.length === 0) return;
    setPw(password);
    submittingRef.current = true;
    setSubmitting(true);
    setErr(null);
    try {
      await onSubmit(password);
    } catch {
      setErr('主密码错误，请重试');
      setPw('');
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handlePwChange = (value: string) => {
    if (value.includes('\r')) {
      void submit(stripReturn(value));
      return;
    }
    setPw(value);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>解锁 sshm</Text>
      <Box marginTop={1}>
        <Text>主密码: </Text>
        <TextInput
          value={pw}
          onChange={handlePwChange}
          onSubmit={submit}
          mask="•"
          focus={!submitting}
        />
      </Box>
      {err && (
        <Box marginTop={1}>
          <Text color="red">{err}</Text>
        </Box>
      )}
      {submitting && <Text color="yellow">正在解锁…</Text>}
    </Box>
  );
}
