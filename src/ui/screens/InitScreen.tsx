import React, { useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { AuthBanner } from '../components/AuthBanner.js';
import { AuthPasswordField } from '../components/AuthPasswordField.js';

function stripReturn(value: string): string {
  return value.replace(/\r/g, '');
}

export function InitScreen({
  onSubmit,
}: {
  onSubmit: (password: string) => Promise<void>;
}) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [stage, setStage] = useState<'first' | 'confirm'>('first');
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const submitFirst = (password: string) => {
    if (submittingRef.current || submitting) return;
    if (password.length < 4) {
      setErr('主密码至少需要 4 个字符');
      return;
    }
    setPw(password);
    setErr(null);
    setStage('confirm');
  };

  const submitConfirm = async (confirm: string) => {
    if (submittingRef.current || submitting) return;
    if (pw !== confirm) {
      setErr('两次输入的主密码不一致');
      setPw2('');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setErr(null);
    try {
      await onSubmit(pw);
    } catch {
      setErr('创建加密仓库失败，请重试');
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handlePwChange = (value: string) => {
    if (value.includes('\r')) {
      submitFirst(stripReturn(value));
      return;
    }
    setPw(value);
  };

  const handlePw2Change = (value: string) => {
    if (value.includes('\r')) {
      setPw2(stripReturn(value));
      void submitConfirm(stripReturn(value));
      return;
    }
    setPw2(value);
  };

  return (
    <Box flexDirection="column">
      <Box paddingX={1} paddingY={1}>
        <AuthBanner />
      </Box>
      {stage === 'first' ? (
        <AuthPasswordField
          label="主密码:"
          value={pw}
          onChange={handlePwChange}
          onSubmit={submitFirst}
          focus={!submitting}
        />
      ) : (
        <AuthPasswordField
          label="再次输入:"
          value={pw2}
          onChange={handlePw2Change}
          onSubmit={(value) => {
            void submitConfirm(value);
          }}
          focus={!submitting}
        />
      )}
      {err && (
        <Box paddingX={1} marginTop={1}>
          <Text color="red">{err}</Text>
        </Box>
      )}
      {submitting && (
        <Box paddingX={1}>
          <Text color="yellow">正在创建加密仓库…</Text>
        </Box>
      )}
    </Box>
  );
}
