import React, { useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

const FIELDS = ['current', 'next', 'confirm'] as const;
type Field = (typeof FIELDS)[number];
type FormValues = Record<Field, string>;
type FormError = { field?: Field; message: string };

const HELP =
  'Tab/Shift+Tab 切换   Enter 下一项   Ctrl+S 保存   ' +
  'Ctrl+R 显示密码   Esc 取消';

function validate(values: FormValues): FormError | null {
  if (values.current === '') {
    return { field: 'current', message: '请输入当前主密码' };
  }
  if (values.next.length < 4) {
    return { field: 'next', message: '主密码至少需要 4 个字符' };
  }
  if (values.next !== values.confirm) {
    return { field: 'confirm', message: '两次输入的主密码不一致' };
  }
  if (values.next === values.current) {
    return { field: 'next', message: '新主密码不能与当前主密码相同' };
  }
  return null;
}

function saveError(error: unknown): FormError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('current password is incorrect')) {
    return { field: 'current', message: '当前主密码错误，请重试' };
  }
  return { message: '更改主密码失败，请重试' };
}

export function ChangePasswordScreen({
  onSave,
  onCancel,
}: {
  onSave: (current: string, next: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<FormValues>({
    current: '',
    next: '',
    confirm: '',
  });
  const [focus, setFocus] = useState<Field>('current');
  const [error, setError] = useState<FormError | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const shortcutRef = useRef(false);
  const [showPw, setShowPw] = useState(false);

  const moveFocus = (dir: 1 | -1) => {
    const idx = FIELDS.indexOf(focus);
    setFocus(FIELDS[(idx + dir + FIELDS.length) % FIELDS.length]);
  };

  const markShortcut = () => {
    shortcutRef.current = true;
    queueMicrotask(() => {
      shortcutRef.current = false;
    });
  };

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
      await onSave(values.current, values.next);
    } catch (caught) {
      const nextError = saveError(caught);
      if (nextError.field === 'current') {
        setValues((current) => ({ ...current, current: '' }));
      }
      setError(nextError);
      if (nextError.field) setFocus(nextError.field);
      savingRef.current = false;
      setSaving(false);
    }
  };

  useInput((input, key) => {
    if (savingRef.current || saving) return;
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

  const row = (field: Field, label: string) => {
    const focused = focus === field;
    const displayLabel = `${focused ? '›' : ' '} ${label} *:`;
    const mask = showPw ? undefined : '•';
    return (
      <Box key={field}>
        <Text color={focused ? 'cyan' : undefined}>
          {displayLabel.padEnd(16)}
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
              if (field === 'confirm') void trySave();
              else moveFocus(1);
            }}
            mask={mask}
            focus={!saving}
          />
        ) : (
          <Text>{mask ? mask.repeat(values[field].length) : values[field]}</Text>
        )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>更改主密码</Text>
      <Box flexDirection="column" marginTop={1}>
        {row('current', '当前主密码')}
        {row('next', '新主密码')}
        {row('confirm', '再次输入')}
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">{error.message}</Text>
        </Box>
      )}
      {saving && (
        <Box marginTop={1}>
          <Text color="yellow">正在更改主密码…</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="gray">{HELP}</Text>
      </Box>
    </Box>
  );
}
