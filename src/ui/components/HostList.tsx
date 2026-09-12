import React from 'react';
import { Box, Text } from 'ink';
import { Host } from '../../hosts/types.js';

export function HostList({
  hosts,
  selectedId,
}: {
  hosts: Host[];
  selectedId: string | null;
}) {
  if (hosts.length === 0) {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="gray">还没有主机，按 </Text>
        <Text bold color="cyan">
          a
        </Text>
        <Text color="gray"> 添加第一台主机</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {hosts.map((host) => {
        const selected = host.id === selectedId;
        return (
          <Text
            key={host.id}
            inverse={selected}
            color={selected ? 'cyan' : undefined}
          >
            {selected ? '› ' : '  '}
            {host.alias.padEnd(20)} {host.user}@{host.host}:{host.port}
          </Text>
        );
      })}
    </Box>
  );
}
