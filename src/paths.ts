import os from 'node:os';
import path from 'node:path';

export interface Paths {
  baseDir: string;
  vaultFile: string;
  knownHostsFile: string;
}

export function defaultPaths(homeDir: string = os.homedir()): Paths {
  const baseDir = path.join(homeDir, '.sshm');
  return {
    baseDir,
    vaultFile: path.join(baseDir, 'vault.enc'),
    knownHostsFile: path.join(baseDir, 'known_hosts.json'),
  };
}
