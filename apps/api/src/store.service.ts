import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  DEFAULT_PROFILE,
  RunPhase,
  RunStatus,
  type PersistedRun,
  type ProfileState,
  type RunState,
  type RunSummary,
} from '@isaac-spire/game';
import { RunRepository, type StorageStats } from './storage/run-repository.js';
import { loadStorageConfig } from './storage/storage-config.js';
import { SqliteRunRepository } from './storage/sqlite-run.repository.js';

@Injectable()
export class StoreService implements OnModuleInit, OnModuleDestroy {
  private readonly repository: RunRepository;
  private readonly retentionPolicy: { maxCompletedRuns: number; maxActiveRuns: number };
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(@Optional() @Inject(RunRepository) repository?: RunRepository) {
    const config = loadStorageConfig();
    this.repository = repository ?? new SqliteRunRepository(config);
    this.retentionPolicy = {
      maxCompletedRuns: config.maxCompletedRuns,
      maxActiveRuns: config.maxActiveRuns,
    };
  }

  async onModuleInit(): Promise<void> {
    await this.repository.initialize();
    await this.repository.compact(this.retentionPolicy);
  }

  onModuleDestroy(): void {
    this.repository.close();
  }

  async profile(): Promise<ProfileState> {
    await this.writeQueue;
    return this.repository.getProfile();
  }

  async listRuns(limit = 20): Promise<RunSummary[]> {
    await this.writeQueue;
    return this.repository.listRuns(limit);
  }

  async getRun(id: string): Promise<PersistedRun> {
    await this.writeQueue;
    const run = await this.repository.findRun(id);
    if (!run) throw new NotFoundException(`Run ${id} was not found`);
    return run;
  }

  async latestActiveRun(): Promise<PersistedRun | undefined> {
    await this.writeQueue;
    return this.repository.findLatestActiveRun();
  }

  async saveRun(snapshot: RunState): Promise<PersistedRun> {
    this.assertSnapshot(snapshot);
    let result!: PersistedRun;
    await this.enqueue(async () => {
      const timestamp = new Date().toISOString();
      const previous = await this.repository.findRun(snapshot.id);
      const profile = { ...structuredClone(DEFAULT_PROFILE), ...(await this.repository.getProfile()) };
      result = {
        id: snapshot.id,
        status:
          snapshot.phase === RunPhase.Victory
            ? RunStatus.Won
            : snapshot.phase === RunPhase.Defeat
              ? RunStatus.Lost
              : RunStatus.Active,
        snapshot,
        createdAt: previous?.createdAt ?? snapshot.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      this.updateProfile(profile, snapshot, result.status, previous?.status);
      await this.repository.commit(result, profile);
    });
    return result;
  }

  async deleteRun(id: string): Promise<void> {
    let deleted = false;
    await this.enqueue(async () => {
      deleted = await this.repository.deleteRun(id);
    });
    if (!deleted) throw new NotFoundException(`Run ${id} was not found`);
  }

  async compact(): Promise<StorageStats> {
    let stats!: StorageStats;
    await this.enqueue(async () => {
      stats = await this.repository.compact(this.retentionPolicy);
    });
    return stats;
  }

  async storageStats(): Promise<StorageStats> {
    await this.writeQueue;
    return this.repository.stats();
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    this.writeQueue = this.writeQueue.then(operation, operation);
    return this.writeQueue;
  }

  private assertSnapshot(snapshot: RunState): void {
    if (!snapshot?.id || !snapshot.seed || !snapshot.player || !snapshot.floorMap) {
      throw new TypeError('Invalid run snapshot');
    }
  }

  private updateProfile(
    profile: ProfileState,
    snapshot: RunState,
    status: PersistedRun['status'],
    previousStatus?: PersistedRun['status'],
  ): void {
    profile.unlockedItemIds = [...new Set([...profile.unlockedItemIds, ...snapshot.unlocks])];
    profile.discoveredItemIds = [...new Set([...profile.discoveredItemIds, ...snapshot.player.items])];
    if (status === RunStatus.Won && previousStatus !== RunStatus.Won) profile.wins += 1;
    if (status === RunStatus.Lost && previousStatus !== RunStatus.Lost) profile.losses += 1;
    profile.bestScore = Math.max(profile.bestScore, snapshot.score);
  }
}
