import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRun } from '@isaac-spire/game';
import { StoreService } from './store.service.js';

let temporaryDirectory: string | undefined;

afterEach(async () => {
  delete process.env.ISAAC_SPIRE_DATA_FILE;
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe('StoreService', () => {
  it('persists a run and updates meta progression once', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'isaac-spire-test-'));
    process.env.ISAAC_SPIRE_DATA_FILE = join(temporaryDirectory, 'store.json');
    const store = new StoreService();
    const run = createRun('API-SAVE');
    run.phase = 'victory';
    run.victory = true;
    run.score = 1234;
    run.unlocks.push('moms-knife');
    await store.saveRun(run);
    await store.saveRun(run);
    const saved = await store.getRun(run.id);
    const profile = await store.profile();
    expect(saved.status).toBe('won');
    expect(saved.snapshot.seed).toBe('API-SAVE');
    expect(profile.wins).toBe(1);
    expect(profile.bestScore).toBe(1234);
    expect(profile.unlockedItemIds).toContain('moms-knife');
  });
});
