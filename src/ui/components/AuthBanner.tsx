import React from 'react';
import { Box, Text } from 'ink';

export const AUTH_BANNER_LINES = [
  '  ____  ____  _   _ __  __',
  ' / ___|| ___|| | | |  \\/  |',
  ' \\___ \\|___ \\| |_| | |\\/| |',
  '  ___) |___) |  _  | |  | |',
  ' |____/|____/|_| |_|_|  |_|',
  '  本地加密 SSH 主机管理器',
] as const;

export function AuthBanner() {
  return (
    <Box flexDirection="column">
      {AUTH_BANNER_LINES.map((line) => (
        <Text key={line}>{line}</Text>
      ))}
    </Box>
  );
}
