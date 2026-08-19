import { dirname, extname, resolve } from 'node:path';

export interface StorageConfig {
  databaseFile: string;
  legacyJsonFile: string;
  maxCompletedRuns: number;
  maxActiveRuns: number;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const legacyJsonFile = resolve(env.ISAAC_SPIRE_DATA_FILE ?? 'data/runtime/store.json');
  const inferredDatabase = resolve(
    dirname(legacyJsonFile),
    `${extname(legacyJsonFile) ? 'isaac-spire' : 'store'}.sqlite`,
  );
  return {
    databaseFile: resolve(env.ISAAC_SPIRE_DB_FILE ?? inferredDatabase),
    legacyJsonFile,
    maxCompletedRuns: positiveInteger(env.ISAAC_SPIRE_HISTORY_LIMIT, 50),
    maxActiveRuns: positiveInteger(env.ISAAC_SPIRE_ACTIVE_RUN_LIMIT, 5),
  };
}
