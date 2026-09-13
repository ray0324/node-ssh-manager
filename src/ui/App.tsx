import React, { useState } from 'react';
import { useServices } from './context.js';
import { ListScreen } from './screens/ListScreen.js';
import { HostFormScreen } from './screens/HostFormScreen.js';
import { ChangePasswordScreen } from './screens/ChangePasswordScreen.js';
import { Host } from '../hosts/types.js';

interface Props {
  onConnect: (h: Host) => void;
}

type Route =
  | { kind: 'list' }
  | { kind: 'add' }
  | { kind: 'edit'; host: Host }
  | { kind: 'change-password' };

export function App({ onConnect }: Props) {
  const { repo, vault } = useServices();
  const [route, setRoute] = useState<Route>({ kind: 'list' });
  const [notice, setNotice] = useState<string | null>(null);
  const [, force] = useState(0);

  const refresh = () => force((n) => n + 1);

  if (route.kind === 'change-password') {
    return (
      <ChangePasswordScreen
        onCancel={() => setRoute({ kind: 'list' })}
        onSave={async (current, next) => {
          await vault.changePassword(current, next);
          setNotice('主密码已更改');
          setRoute({ kind: 'list' });
        }}
      />
    );
  }

  if (route.kind === 'add') {
    return (
      <HostFormScreen
        onCancel={() => setRoute({ kind: 'list' })}
        onSave={async (input) => {
          await repo.add(input);
          setRoute({ kind: 'list' });
          refresh();
        }}
      />
    );
  }

  if (route.kind === 'edit') {
    return (
      <HostFormScreen
        initial={route.host}
        onCancel={() => setRoute({ kind: 'list' })}
        onSave={async (input) => {
          await repo.update(route.host.id, input);
          setRoute({ kind: 'list' });
          refresh();
        }}
      />
    );
  }

  return (
    <ListScreen
      hosts={repo.list()}
      onConnect={onConnect}
      onAdd={() => setRoute({ kind: 'add' })}
      onEdit={(h) => setRoute({ kind: 'edit', host: h })}
      onDelete={async (h) => {
        await repo.remove(h.id);
        refresh();
      }}
      onChangePassword={() => setRoute({ kind: 'change-password' })}
      notice={notice}
      onClearNotice={() => setNotice(null)}
    />
  );
}
