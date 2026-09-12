import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Host } from '../../hosts/types.js';
import { HostList } from '../components/HostList.js';
import { Footer } from '../components/Footer.js';
import { ConfirmModal } from '../components/ConfirmModal.js';

interface Props {
  hosts: Host[];
  onConnect: (h: Host) => void;
  onAdd: () => void;
  onEdit: (h: Host) => void;
  onDelete: (h: Host) => Promise<void>;
}

export function ListScreen({ hosts, onConnect, onAdd, onEdit, onDelete }: Props) {
  const { exit } = useApp();
  const [cursor, setCursor] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<Host | null>(null);
  const [reveal, setReveal] = useState<Host | null>(null);

  const selected = hosts[cursor];

  useInput((input, key) => {
    if (pendingDelete) return; // modal owns input
    if (reveal) {
      setReveal(null);
      return;
    }
    if (key.upArrow || input === 'k') setCursor((c) => Math.max(0, c - 1));
    else if (key.downArrow || input === 'j')
      setCursor((c) => Math.min(Math.max(hosts.length - 1, 0), c + 1));
    else if (key.return && selected) onConnect(selected);
    else if (input === 'a') onAdd();
    else if (input === 'e' && selected) onEdit(selected);
    else if (input === 'd' && selected) setPendingDelete(selected);
    else if (input === 'p' && selected) setReveal(selected);
    else if (input === 'q') exit();
  });

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" paddingX={1}>
        <Text bold>sshm · SSH 主机管理器</Text>
        <Box flexGrow={1} />
        <Text color="gray">{hosts.length} 台主机</Text>
      </Box>
      <HostList hosts={hosts} selectedId={selected?.id ?? null} />
      <Footer
        primary={[
          { key: '↑↓/jk', label: '选择' },
          { key: 'Enter', label: '连接' },
          { key: 'a', label: '添加' },
          { key: 'e', label: '编辑' },
        ]}
        secondary={[
          { key: 'd', label: '删除' },
          { key: 'p', label: '查看密码' },
          { key: 'q', label: '退出' },
        ]}
      />
      {pendingDelete && (
        <ConfirmModal
          message={`确认删除 "${pendingDelete.alias}" ?`}
          onConfirm={async () => {
            const h = pendingDelete;
            setPendingDelete(null);
            await onDelete(h);
            setCursor((c) => Math.max(0, c - (c >= hosts.length - 1 ? 1 : 0)));
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {reveal && (
        <Box marginTop={1} borderStyle="round" paddingX={1} flexDirection="column">
          <Text bold>{reveal.alias} 的密码</Text>
          <Text color="yellow">{reveal.password}</Text>
          <Text color="gray">按任意键关闭</Text>
        </Box>
      )}
    </Box>
  );
}
