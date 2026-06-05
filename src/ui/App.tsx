import React, { useState } from 'react';
import { useServices } from './context.js';
import { ListScreen } from './screens/ListScreen.js';
import { HostFormScreen } from './screens/HostFormScreen.js';
import { Host } from '../hosts/types.js';

interface Props {
  onConnect: (h: Host) => void;
}

type Route =
  | { kind: 'list' }
  | { kind: 'add' }
  | { kind: 'edit'; host: Host };

export function App({ onConnect }: Props) {
  const { repo } = useServices();
  const [route, setRoute] = useState<Route>({ kind: 'list' });
  const [, force] = useState(0);

  const refresh = () => force((n) => n + 1);

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
    />
  );
}
