import React, { useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { AuthBanner } from '../components/AuthBanner.js';
import { AuthPasswordField } from '../components/AuthPasswordField.js';

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
    <Box flexDirection="column">
      <Box paddingX={1} paddingY={1}>
        <AuthBanner />
      </Box>
      <AuthPasswordField
        label="主密码:"
        value={pw}
        onChange={handlePwChange}
        onSubmit={(value) => {
          void submit(value);
        }}
        focus={!submitting}
      />
      {err && (
        <Box paddingX={1} marginTop={1}>
          <Text color="red">{err}</Text>
        </Box>
      )}
      {submitting && (
        <Box paddingX={1}>
          <Text color="yellow">正在解锁…</Text>
        </Box>
      )}
    </Box>
  );
}
