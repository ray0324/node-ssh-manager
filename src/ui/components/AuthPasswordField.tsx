import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

export function AuthPasswordField({
  label,
  value,
  onChange,
  onSubmit,
  focus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  focus: boolean;
}) {
  return (
    <Box
      borderStyle="single"
      borderTop
      borderBottom
      borderLeft={false}
      borderRight={false}
      paddingX={1}
      width="100%"
    >
      <Text>{label} </Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        mask="•"
        focus={focus}
      />
    </Box>
  );
}
