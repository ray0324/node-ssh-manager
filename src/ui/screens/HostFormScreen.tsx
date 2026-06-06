import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { Host, HostInput } from '../../hosts/types.js';

interface Props {
  initial?: Host;
  onSave: (input: HostInput) => Promise<void>;
  onCancel: () => void;
}

const FIELDS = ['alias', 'host', 'port', 'user', 'password', 'note'] as const;
type Field = (typeof FIELDS)[number];

export function HostFormScreen({ initial, onSave, onCancel }: Props) {
  const [values, setValues] = useState({
    alias: initial?.alias ?? '',
    host: initial?.host ?? '',
    port: String(initial?.port ?? 22),
    user: initial?.user ?? '',
    password: initial?.password ?? '',
    note: initial?.note ?? '',
  });
  const [focus, setFocus] = useState<Field>('alias');
  const [err, setErr] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const moveFocus = (dir: 1 | -1) => {
    const idx = FIELDS.indexOf(focus);
    const next = (idx + dir + FIELDS.length) % FIELDS.length;
    setFocus(FIELDS[next]);
  };

  useInput((input, key) => {
    if (key.escape) onCancel();
    else if (key.ctrl && input === 's') trySave();
    else if (key.ctrl && input === 'r') setShowPw((v) => !v);
    else if (key.tab && key.shift) moveFocus(-1);
    else if (key.tab) moveFocus(1);
  });

  const trySave = async () => {
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setErr('port must be an integer 1–65535');
      setFocus('port');
      return;
    }
    try {
      await onSave({
        alias: values.alias.trim(),
        host: values.host.trim(),
        port,
        user: values.user.trim(),
        password: values.password,
        note: values.note,
      });
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  };

  const row = (field: Field, label: string, mask?: string) => (
    <Box key={field}>
      <Text color={focus === field ? 'cyan' : undefined}>{label.padEnd(10)}</Text>
      {focus === field ? (
        <TextInput
          value={values[field]}
          onChange={(v) => setValues((s) => ({ ...s, [field]: v }))}
          onSubmit={() => (field === 'note' ? trySave() : moveFocus(1))}
          mask={mask}
        />
      ) : (
        <Text>{mask ? mask.repeat(values[field].length) : values[field]}</Text>
      )}
    </Box>
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>{initial ? '编辑主机' : '添加主机'}</Text>
      <Box flexDirection="column" marginTop={1}>
        {row('alias', '别名:')}
        {row('host', 'host:')}
        {row('port', 'port:')}
        {row('user', 'user:')}
        {row('password', '密码:', showPw ? undefined : '•')}
        {row('note', '备注:')}
      </Box>
      {err && (
        <Box marginTop={1}>
          <Text color="red">{err}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="gray">
          Tab/↑↓ 切换字段   Enter 下一项   Ctrl-S 保存   Ctrl-R 显示/隐藏密码   Esc 取消
        </Text>
      </Box>
    </Box>
  );
}
