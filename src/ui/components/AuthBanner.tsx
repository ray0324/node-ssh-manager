import React from 'react';
import { Box, Text } from 'ink';
import { APP_VERSION } from '../../version.js';

export function AuthBanner() {
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold italic color="green">
          SSH MANAGER
        </Text>
        <Text color="gray">{`  v${APP_VERSION}`}</Text>
      </Box>
      <Box>
        <Text>本地加密 SSH 主机管理器</Text>
        <Text color="gray"> · 凭据保存在本机，主密码无法找回</Text>
      </Box>
    </Box>
  );
}
