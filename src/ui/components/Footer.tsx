import React from 'react';
import { Box, Text } from 'ink';

export function Footer({ hints }: { hints: string }) {
  return (
    <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} paddingX={1}>
      <Text color="gray">{hints}</Text>
    </Box>
  );
}
