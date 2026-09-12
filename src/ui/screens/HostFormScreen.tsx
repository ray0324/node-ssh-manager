import React, { useRef, useState } from 'react';
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
type FormValues = Record<Field, string>;
type FormError = { field?: Field; message: string };

const REQUIRED: Array<{ field: Field; message: string }> = [
  { field: 'alias', message: '请输入别名' },
  { field: 'host', message: '请输入主机地址' },
  { field: 'user', message: '请输入用户' },
  { field: 'password', message: '请输入密码' },
];

const HELP =
  'Tab/Shift+Tab 切换   Enter 下一项   Ctrl+S 保存   ' +
  'Ctrl+R 显示密码   Esc 取消';

function validate(values: FormValues): FormError | null {
  for (const required of REQUIRED) {
    if (values[required.field].trim() === '') return required;
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return {
      field: 'port',
      message: '端口必须是 1–65535 之间的整数',
    };
  }
  return null;
}

function saveError(error: unknown): FormError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('alias') && message.includes('already exists')) {
    return { field: 'alias', message: '该别名已存在' };
  }
  return { message: '保存失败，请重试' };
}

export function HostFormScreen({ initial, onSave, onCancel }: Props) {
  const [values, setValues] = useState<FormValues>({
    alias: initial?.alias ?? '',
    host: initial?.host ?? '',
    port: String(initial?.port ?? 22),
    user: initial?.user ?? '',
    password: initial?.password ?? '',
    note: initial?.note ?? '',
  });
  const [focus, setFocus] = useState<Field>('alias');
  const [error, setError] = useState<FormError | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const shortcutRef = useRef(false);
  const [showPw, setShowPw] = useState(false);

  const moveFocus = (dir: 1 | -1) => {
    const idx = FIELDS.indexOf(focus);
    const next = (idx + dir + FIELDS.length) % FIELDS.length;
    setFocus(FIELDS[next]);
  };

  const markShortcut = () => {
    shortcutRef.current = true;
    queueMicrotask(() => {
      shortcutRef.current = false;
    });
  };

  useInput((input, key) => {
    if (saving) return;
    if (key.escape) onCancel();
    else if (key.ctrl && input === 's') {
      markShortcut();
      void trySave();
    } else if (key.ctrl && input === 'r') {
      markShortcut();
      setShowPw((visible) => !visible);
    } else if (key.tab && key.shift) moveFocus(-1);
    else if (key.tab) moveFocus(1);
  });

  const trySave = async () => {
    if (savingRef.current) return;
    const validationError = validate(values);
    if (validationError) {
      setError(validationError);
      if (validationError.field) setFocus(validationError.field);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        alias: values.alias.trim(),
        host: values.host.trim(),
        port: Number(values.port),
        user: values.user.trim(),
        password: values.password,
        note: values.note,
      });
    } catch (caught) {
      const nextError = saveError(caught);
      setError(nextError);
      if (nextError.field) setFocus(nextError.field);
      savingRef.current = false;
      setSaving(false);
    }
  };

  const row = (
    field: Field,
    label: string,
    required = false,
    mask?: string,
  ) => {
    const focused = focus === field;
    const displayLabel = `${focused ? '›' : ' '} ${label}${
      required ? ' *' : ''
    }:`;
    return (
      <Box key={field}>
        <Text color={focused ? 'cyan' : undefined}>
          {displayLabel.padEnd(13)}
        </Text>
        {focused ? (
          <TextInput
            value={values[field]}
            onChange={(value) => {
              if (shortcutRef.current) {
                shortcutRef.current = false;
                return;
              }
              if (savingRef.current) return;
              setValues((current) => ({ ...current, [field]: value }));
              if (error?.field === field) setError(null);
            }}
            onSubmit={() => {
              if (field === 'note') void trySave();
              else moveFocus(1);
            }}
            mask={mask}
            focus={!saving}
          />
        ) : (
          <Text>
            {mask ? mask.repeat(values[field].length) : values[field]}
          </Text>
        )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>{initial ? '编辑主机' : '添加主机'}</Text>
      <Box flexDirection="column" marginTop={1}>
        {row('alias', '别名', true)}
        {row('host', '主机', true)}
        {row('port', '端口', true)}
        {row('user', '用户', true)}
        {row('password', '密码', true, showPw ? undefined : '•')}
        {row('note', '备注')}
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">{error.message}</Text>
        </Box>
      )}
      {saving && (
        <Box marginTop={1}>
          <Text color="yellow">正在保存…</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="gray">{HELP}</Text>
      </Box>
    </Box>
  );
}
