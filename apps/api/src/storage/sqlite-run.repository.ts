import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import {
  DEFAULT_PROFILE,
  RunStatus,
  type PersistedRun,
  type ProfileState,
  type RunState,
  type RunSummary,
} from '@isaac-spire/game';
import { decodeSnapshot, encodeSnapshot } from './snapshot-codec.js';
import { RunRepository, type RetentionPolicy, type StorageStats } from './run-repository.js';
import type { StorageConfig } from './storage-config.js';

interface RunRow {
  id: string;
  status: PersistedRun['status'];
  seed: string;
  floor_index: number;
  score: number;
  snapshot: Uint8Array;
  created_at: string;
  updated_at: string;
}

interface LegacyStoreData {
  runs?: Record<string, PersistedRun>;
  profile?: ProfileState;
}

export class SqliteRunRepository extends RunRepository {
  private database?: DatabaseSync;
  private initialized = false;

  constructor(private readonly config: StorageConfig) {
    super();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    mkdirSync(dirname(this.config.databaseFile), { recursive: true });
    this.database = new DatabaseSync(this.config.databaseFile);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA auto_vacuum = INCREMENTAL;
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload BLOB NOT NULL,
        uncompressed_bytes INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('${RunStatus.Active}', '${RunStatus.Won}', '${RunStatus.Lost}')),
        seed TEXT NOT NULL,
        floor_index INTEGER NOT NULL,
        score INTEGER NOT NULL,
        snapshot BLOB NOT NULL,
        uncompressed_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS runs_status_updated_idx ON runs(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS runs_updated_idx ON runs(updated_at DESC);
    `);
    this.initialized = true;
    this.ensureProfile();
    this.importLegacyJson();
  }

  async getProfile(): Promise<ProfileState> {
    await this.initialize();
    const row = this.db.prepare('SELECT payload FROM profile WHERE id = 1').get() as { payload: Uint8Array };
    return decodeSnapshot<ProfileState>(row.payload);
  }

  async saveProfile(profile: ProfileState): Promise<void> {
    await this.initialize();
    this.transaction(() => this.upsertProfile(profile, new Date().toISOString()));
  }

  async listRuns(limit = 20): Promise<RunSummary[]> {
    await this.initialize();
    const rows = this.db
      .prepare(
        `
      SELECT id, status, seed, floor_index, score, created_at, updated_at
      FROM runs ORDER BY updated_at DESC, rowid DESC LIMIT ?
    `,
      )
      .all(limit) as unknown as Array<Omit<RunRow, 'snapshot'>>;
    return rows.map((row) => this.toSummary(row));
  }

  async findRun(id: string): Promise<PersistedRun | undefined> {
    await this.initialize();
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as RunRow | undefined;
    return row ? this.toPersistedRun(row) : undefined;
  }

  async findLatestActiveRun(): Promise<PersistedRun | undefined> {
    await this.initialize();
    const row = this.db
      .prepare(
        `
      SELECT * FROM runs WHERE status = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1
    `,
      )
      .get(RunStatus.Active) as RunRow | undefined;
    return row ? this.toPersistedRun(row) : undefined;
  }

  async commit(run: PersistedRun, profile: ProfileState): Promise<void> {
    await this.initialize();
    this.transaction(() => {
      this.upsertRun(run);
      this.upsertProfile(profile, run.updatedAt);
    });
  }

  async deleteRun(id: string): Promise<boolean> {
    await this.initialize();
    const result = this.db.prepare('DELETE FROM runs WHERE id = ?').run(id);
    return result.changes > 0;
  }

  async compact(policy: RetentionPolicy): Promise<StorageStats> {
    await this.initialize();
    this.transaction(() => {
      this.db
        .prepare(
          `
      DELETE FROM runs
      WHERE status <> ?
        AND id NOT IN (
          SELECT id FROM runs WHERE status <> ? ORDER BY updated_at DESC, rowid DESC LIMIT ?
        )
    `,
        )
        .run(RunStatus.Active, RunStatus.Active, policy.maxCompletedRuns);
      this.db
        .prepare(
          `
      DELETE FROM runs
      WHERE status = ?
        AND id NOT IN (
          SELECT id FROM runs WHERE status = ? ORDER BY updated_at DESC, rowid DESC LIMIT ?
        )
    `,
        )
        .run(RunStatus.Active, RunStatus.Active, policy.maxActiveRuns);
    });
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA incremental_vacuum; PRAGMA optimize;');
    return this.stats();
  }

  async stats(): Promise<StorageStats> {
    await this.initialize();
    const row = this.db
      .prepare(
        `
      SELECT COUNT(*) AS run_count,
        SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS active_count,
        COALESCE(SUM(length(snapshot)), 0) AS compressed_bytes,
        COALESCE(SUM(uncompressed_bytes), 0) AS uncompressed_bytes
      FROM runs
    `,
      )
      .get(RunStatus.Active) as {
      run_count: number;
      active_count: number;
      compressed_bytes: number;
      uncompressed_bytes: number;
    };
    return {
      databaseBytes: existsSync(this.config.databaseFile) ? statSync(this.config.databaseFile).size : 0,
      runCount: Number(row.run_count),
      activeRunCount: Number(row.active_count),
      compressedSnapshotBytes: Number(row.compressed_bytes),
      uncompressedSnapshotBytes: Number(row.uncompressed_bytes),
    };
  }

  close(): void {
    this.database?.close();
    this.database = undefined;
    this.initialized = false;
  }

  private get db(): DatabaseSync {
    if (!this.database) throw new Error('SQLite repository has not been initialized');
    return this.database;
  }

  private ensureProfile(): void {
    const existing = this.db.prepare('SELECT 1 FROM profile WHERE id = 1').get();
    if (!existing) this.upsertProfile(structuredClone(DEFAULT_PROFILE), new Date().toISOString());
  }

  private upsertProfile(profile: ProfileState, updatedAt: string): void {
    const payload = encodeSnapshot(profile);
    this.db
      .prepare(
        `
      INSERT INTO profile(id, payload, uncompressed_bytes, updated_at)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        payload = excluded.payload,
        uncompressed_bytes = excluded.uncompressed_bytes,
        updated_at = excluded.updated_at
    `,
      )
      .run(payload.compressed, payload.uncompressedBytes, updatedAt);
  }

  private upsertRun(run: PersistedRun): void {
    const payload = encodeSnapshot(run.snapshot);
    this.db
      .prepare(
        `
      INSERT INTO runs(id, status, seed, floor_index, score, snapshot, uncompressed_bytes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        seed = excluded.seed,
        floor_index = excluded.floor_index,
        score = excluded.score,
        snapshot = excluded.snapshot,
        uncompressed_bytes = excluded.uncompressed_bytes,
        updated_at = excluded.updated_at
    `,
      )
      .run(
        run.id,
        run.status,
        run.snapshot.seed,
        run.snapshot.floorIndex,
        run.snapshot.score,
        payload.compressed,
        payload.uncompressedBytes,
        run.createdAt,
        run.updatedAt,
      );
  }

  private importLegacyJson(): void {
    if (!existsSync(this.config.legacyJsonFile)) return;
    const imported = this.db.prepare("SELECT value FROM metadata WHERE key = 'legacy_json_imported'").get();
    if (imported) return;

    const source = readFileSync(this.config.legacyJsonFile);
    const legacy = JSON.parse(source.toString('utf8')) as LegacyStoreData;
    this.transaction(() => {
      for (const run of Object.values(legacy.runs ?? {})) this.upsertRun(run);
      if (legacy.profile) this.upsertProfile(legacy.profile, new Date().toISOString());
      this.db
        .prepare("INSERT OR REPLACE INTO metadata(key, value) VALUES ('legacy_json_imported', ?)")
        .run(new Date().toISOString());
    });

    const backup = `${this.config.legacyJsonFile}.migrated.json.gz`;
    const temporary = `${backup}.tmp`;
    writeFileSync(temporary, gzipSync(source, { level: 9 }));
    renameSync(temporary, backup);
    rmSync(this.config.legacyJsonFile);
  }

  private transaction(operation: () => void): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      operation();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private toPersistedRun(row: RunRow): PersistedRun {
    return {
      id: row.id,
      status: row.status,
      snapshot: decodeSnapshot<RunState>(row.snapshot),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toSummary(row: Omit<RunRow, 'snapshot'>): RunSummary {
    return {
      id: row.id,
      status: row.status,
      seed: row.seed,
      floorIndex: row.floor_index,
      score: row.score,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
