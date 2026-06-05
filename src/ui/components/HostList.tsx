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
      <Box paddingX={1}>
        <Text color="gray">(no hosts yet — press 'a' to add one)</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" paddingX={1}>
      {hosts.map((h) => {
        const sel = h.id === selectedId;
        const prefix = sel ? '> ' : '  ';
        return (
          <Text key={h.id} inverse={sel}>
            {prefix}
            {h.alias.padEnd(20)} {h.user}@{h.host}:{h.port}
          </Text>
        );
      })}
    </Box>
  );
}
