import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

export function InitScreen({
  onSubmit,
}: {
  onSubmit: (password: string) => Promise<void>;
}) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [stage, setStage] = useState<'first' | 'confirm'>('first');
  const [err, setErr] = useState<string | null>(null);

  const submitFirst = () => {
    if (pw.length < 4) {
      setErr('master password must be ≥ 4 characters');
      return;
    }
    setErr(null);
    setStage('confirm');
  };

  const submitConfirm = async () => {
    if (pw !== pw2) {
      setErr('passwords do not match');
      setPw2('');
      return;
    }
    setErr(null);
    try {
      await onSubmit(pw);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>欢迎使用 sshm — 设置主密码</Text>
      <Text color="gray">主密码用于加密所有主机凭据,无法找回,请妥善记忆。</Text>
      <Box marginTop={1}>
        <Text>主密码: </Text>
        {stage === 'first' ? (
          <TextInput value={pw} onChange={setPw} onSubmit={submitFirst} mask="•" />
        ) : (
          <Text>{'•'.repeat(pw.length)}</Text>
        )}
      </Box>
      {stage === 'confirm' && (
        <Box>
          <Text>再次输入: </Text>
          <TextInput value={pw2} onChange={setPw2} onSubmit={submitConfirm} mask="•" />
        </Box>
      )}
      {err && (
        <Box marginTop={1}>
          <Text color="red">{err}</Text>
        </Box>
      )}
    </Box>
  );
}
