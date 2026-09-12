import React, { useRef, useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

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
    <Box flexDirection="column" padding={1}>
      <Text bold>欢迎使用 sshm · 设置主密码</Text>
      <Text color="gray">
        主密码用于加密所有主机凭据，无法找回，请妥善保管。
      </Text>
      <Box marginTop={1}>
        <Text>主密码: </Text>
        {stage === 'first' ? (
          <TextInput
            value={pw}
            onChange={handlePwChange}
            onSubmit={submitFirst}
            mask="•"
            focus={!submitting}
          />
        ) : (
          <Text>{'•'.repeat(pw.length)}</Text>
        )}
      </Box>
      {stage === 'confirm' && (
        <Box>
          <Text>再次输入: </Text>
          <TextInput
            value={pw2}
            onChange={handlePw2Change}
            onSubmit={submitConfirm}
            mask="•"
            focus={!submitting}
          />
        </Box>
      )}
      {err && (
        <Box marginTop={1}>
          <Text color="red">{err}</Text>
        </Box>
      )}
      {submitting && <Text color="yellow">正在创建加密仓库…</Text>}
    </Box>
  );
}
