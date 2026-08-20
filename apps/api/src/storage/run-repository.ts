import type { PersistedRun, ProfileState, RunSummary } from '@isaac-spire/game';

export interface StorageStats {
  databaseBytes: number;
  runCount: number;
  activeRunCount: number;
  compressedSnapshotBytes: number;
  uncompressedSnapshotBytes: number;
}

export interface RetentionPolicy {
  maxCompletedRuns: number;
  maxActiveRuns: number;
}

/** Persistence port. Domain services never depend on SQLite-specific APIs. */
export abstract class RunRepository {
  abstract initialize(): Promise<void>;
  abstract getProfile(): Promise<ProfileState>;
  abstract saveProfile(profile: ProfileState): Promise<void>;
  abstract listRuns(limit?: number): Promise<RunSummary[]>;
  abstract findRun(id: string): Promise<PersistedRun | undefined>;
  abstract findLatestActiveRun(): Promise<PersistedRun | undefined>;
  abstract commit(run: PersistedRun, profile: ProfileState): Promise<void>;
  abstract deleteRun(id: string): Promise<boolean>;
  abstract compact(policy: RetentionPolicy): Promise<StorageStats>;
  abstract stats(): Promise<StorageStats>;
  abstract close(): void;
}
