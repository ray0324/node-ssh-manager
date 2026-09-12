import React from 'react';
import { Box, Text } from 'ink';

export interface FooterHint {
  key: string;
  label: string;
}

interface Props {
  primary: FooterHint[];
  secondary?: FooterHint[];
}

function HintRow({ hints }: { hints: FooterHint[] }) {
  return (
    <Box gap={2}>
      {hints.map((hint) => (
        <Box key={`${hint.key}-${hint.label}`}>
          <Text bold color="cyan">
            {hint.key}
          </Text>
          <Text color="gray"> {hint.label}</Text>
        </Box>
      ))}
    </Box>
  );
}

export function Footer({ primary, secondary = [] }: Props) {
  return (
    <Box
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
      flexDirection="column"
    >
      <HintRow hints={primary} />
      {secondary.length > 0 && <HintRow hints={secondary} />}
    </Box>
  );
}
