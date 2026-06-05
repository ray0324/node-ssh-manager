import React, { createContext, useContext } from 'react';
import { Vault } from '../vault/vault.js';
import { HostRepo } from '../hosts/repo.js';
import { VaultData } from '../hosts/types.js';

interface Services {
  vault: Vault<VaultData>;
  repo: HostRepo;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({
  vault,
  repo,
  children,
}: {
  vault: Vault<VaultData>;
  repo: HostRepo;
  children: React.ReactNode;
}) {
  return (
    <ServicesContext.Provider value={{ vault, repo }}>{children}</ServicesContext.Provider>
  );
}

export function useServices(): Services {
  const v = useContext(ServicesContext);
  if (!v) throw new Error('ServicesProvider missing');
  return v;
}
