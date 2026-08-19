# Storage and migration

## Why SQLite

The original store read and parsed one JSON document, changed one run, pretty-printed every run again, and atomically renamed the whole file. Cost and write amplification therefore grew with the complete history rather than the changed run. A malformed document also affected every save.

SQLite provides indexed lookup, row-level upsert semantics, transactions, WAL concurrency, explicit retention, and safe compaction. It also creates a clean repository boundary for a later Postgres adapter.

## Schema

- `runs`: metadata columns plus one gzip-compressed latest snapshot BLOB per run.
- `profile`: one compressed meta-progression record.
- `metadata`: migration markers.
- Indexes cover latest-run and status/history queries.

The run list returns metadata only. A full snapshot is decompressed only for `GET /runs/:id` or `GET /runs/active/latest`.

## Growth control

- Saving the same run performs an upsert; it never appends another snapshot version.
- Terminal history is limited by `ISAAC_SPIRE_HISTORY_LIMIT` (default `50`). Because the UI resumes only the newest active run, stale active snapshots are limited by `ISAAC_SPIRE_ACTIVE_RUN_LIMIT` (default `5`).
- Combat logs and animation events are bounded before persistence.
- `POST /api/maintenance/storage/compact` prunes terminal history above the limit, checkpoints/truncates WAL, performs incremental vacuum, and optimizes indexes.
- `GET /api/maintenance/storage` reports database size and compressed/uncompressed snapshot totals.
- `DELETE /api/runs/:id` removes an explicitly selected run.

## Legacy JSON migration

On the first API start:

1. Create/open the SQLite database and schema.
2. Import all valid runs and the profile in one transaction.
3. Record a migration marker.
4. Compress the original JSON at gzip level 9 to `store.json.migrated.json.gz`.
5. Remove the uncompressed JSON only after the backup is written and renamed successfully.

The `.gz` file is a recoverable backup and is not read during normal startup. Migration behavior is covered by an automated test.

## Environment

```dotenv
ISAAC_SPIRE_DB_FILE=apps/api/data/runtime/isaac-spire.sqlite
ISAAC_SPIRE_DATA_FILE=apps/api/data/runtime/store.json
ISAAC_SPIRE_HISTORY_LIMIT=50
ISAAC_SPIRE_ACTIVE_RUN_LIMIT=5
```

`ISAAC_SPIRE_DATA_FILE` now identifies only the legacy import source. If `ISAAC_SPIRE_DB_FILE` is omitted, SQLite is created beside that legacy path.

## Operational backup

For a consistent live backup, checkpoint first through the compaction endpoint, then copy the `.sqlite` file. For a hosted service, replace this local adapter with Postgres and managed backups; do not put a shared SQLite file on a network filesystem.
