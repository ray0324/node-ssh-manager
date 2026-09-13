import React, { useEffect, useState } from 'react';
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
  onChangePassword: () => void;
  notice?: string | null;
  onClearNotice?: () => void;
}

export function ListScreen({
  hosts,
  onConnect,
  onAdd,
  onEdit,
  onDelete,
  onChangePassword,
  notice = null,
  onClearNotice,
}: Props) {
  const { exit } = useApp();
  const [cursor, setCursor] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<Host | null>(null);
  const [reveal, setReveal] = useState<Host | null>(null);

  const selected = hosts[cursor];

  useEffect(() => {
    setCursor((current) => Math.min(current, Math.max(hosts.length - 1, 0)));
  }, [hosts.length]);

  useInput((input, key) => {
    if (pendingDelete) return; // modal owns input
    if (reveal) {
      setReveal(null);
      return;
    }
    if (notice) onClearNotice?.();
    if (key.upArrow || input === 'k') setCursor((c) => Math.max(0, c - 1));
    else if (key.downArrow || input === 'j')
      setCursor((c) => Math.min(Math.max(hosts.length - 1, 0), c + 1));
    else if (key.return && selected) onConnect(selected);
    else if (input === 'a') onAdd();
    else if (input === 'e' && selected) onEdit(selected);
    else if (input === 'd' && selected) setPendingDelete(selected);
    else if (input === 'p' && selected) setReveal(selected);
    else if (input === 'c') onChangePassword();
    else if (input === 'q') exit();
  });

  const footer = pendingDelete
    ? {
        primary: [
          { key: '←→/Tab', label: '选择' },
          { key: 'Enter', label: '确认' },
          { key: 'Esc', label: '取消' },
        ],
        secondary: [],
      }
    : reveal
      ? {
          primary: [{ key: '任意键/Esc', label: '关闭密码' }],
          secondary: [],
        }
      : {
          primary: [
            { key: '↑↓/jk', label: '选择' },
            { key: 'Enter', label: '连接' },
            { key: 'a', label: '添加' },
            { key: 'e', label: '编辑' },
          ],
          secondary: [
            { key: 'd', label: '删除' },
            { key: 'p', label: '查看密码' },
            { key: 'c', label: '更改主密码' },
            { key: 'q', label: '退出' },
          ],
        };

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" paddingX={1}>
        <Text bold>sshm · SSH 主机管理器</Text>
        <Box flexGrow={1} />
        <Text color="gray">{hosts.length} 台主机</Text>
      </Box>
      {notice && (
        <Box paddingX={1}>
          <Text color="green">{notice}</Text>
        </Box>
      )}
      <HostList hosts={hosts} selectedId={selected?.id ?? null} />
      <Footer primary={footer.primary} secondary={footer.secondary} />
      {pendingDelete && (
        <ConfirmModal
          message={`确认删除“${pendingDelete.alias}”？`}
          onConfirm={async () => {
            await onDelete(pendingDelete);
            setPendingDelete(null);
            setCursor((current) =>
              Math.min(current, Math.max(hosts.length - 2, 0)),
            );
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {reveal && (
        <Box marginTop={1} borderStyle="round" paddingX={1} flexDirection="column">
          <Text bold color="yellow">
            敏感信息 · {reveal.alias}
          </Text>
          <Text>{reveal.password}</Text>
          <Text color="gray">按任意键或 Esc 关闭</Text>
        </Box>
      )}
    </Box>
  );
}
