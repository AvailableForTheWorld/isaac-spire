import { afterEach, describe, expect, it } from 'vitest';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRun, DEFAULT_PROFILE, type PersistedRun } from '@isaac-spire/game';
import { StoreService } from './store.service.js';

let temporaryDirectory: string | undefined;
let store: StoreService | undefined;

afterEach(async () => {
  store?.onModuleDestroy();
  store = undefined;
  delete process.env.ISAAC_SPIRE_DATA_FILE;
  delete process.env.ISAAC_SPIRE_DB_FILE;
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

async function createStore(): Promise<StoreService> {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'isaac-spire-test-'));
  process.env.ISAAC_SPIRE_DATA_FILE = join(temporaryDirectory, 'store.json');
  process.env.ISAAC_SPIRE_DB_FILE = join(temporaryDirectory, 'runs.sqlite');
  store = new StoreService();
  await store.onModuleInit();
  return store;
}

describe('StoreService', () => {
  it('persists a compressed run and updates meta progression once', async () => {
    const service = await createStore();
    const run = createRun('API-SAVE');
    run.phase = 'victory';
    run.victory = true;
    run.score = 1234;
    run.unlocks.push('moms-knife');
    await service.saveRun(run);
    await service.saveRun(run);
    const saved = await service.getRun(run.id);
    const profile = await service.profile();
    const stats = await service.storageStats();
    expect(saved.status).toBe('won');
    expect(saved.snapshot.seed).toBe('API-SAVE');
    expect(profile.wins).toBe(1);
    expect(profile.bestScore).toBe(1234);
    expect(profile.unlockedItemIds).toContain('moms-knife');
    expect(stats.compressedSnapshotBytes).toBeLessThan(stats.uncompressedSnapshotBytes);
  });

  it('imports a legacy JSON store and replaces it with a compressed backup', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'isaac-spire-legacy-'));
    const legacyFile = join(temporaryDirectory, 'store.json');
    const databaseFile = join(temporaryDirectory, 'runs.sqlite');
    const run = createRun('LEGACY-SAVE');
    const persisted: PersistedRun = {
      id: run.id,
      status: 'active',
      snapshot: run,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
    await writeFile(legacyFile, JSON.stringify({ runs: { [run.id]: persisted }, profile: DEFAULT_PROFILE }));
    process.env.ISAAC_SPIRE_DATA_FILE = legacyFile;
    process.env.ISAAC_SPIRE_DB_FILE = databaseFile;
    store = new StoreService();
    await store.onModuleInit();

    expect((await store.getRun(run.id)).snapshot.seed).toBe('LEGACY-SAVE');
    await expect(access(legacyFile)).rejects.toBeDefined();
    await expect(access(`${legacyFile}.migrated.json.gz`)).resolves.toBeUndefined();
    expect((await readFile(`${legacyFile}.migrated.json.gz`)).byteLength).toBeGreaterThan(0);
  });

  it('keeps only the newest active snapshots during compaction', async () => {
    const service = await createStore();
    for (let index = 0; index < 8; index += 1) {
      await service.saveRun(createRun(`ACTIVE-${index}`));
    }

    const stats = await service.compact();
    const latest = await service.latestActiveRun();
    expect(stats.activeRunCount).toBe(5);
    expect(latest?.snapshot.seed).toBe('ACTIVE-7');
  });
});
