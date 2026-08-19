import { describe, expect, it } from 'vitest';
import { RunPhase, createRun } from '@isaac-spire/game';
import { latestResumableRun } from './localRunRepository';

describe('save slot selection', () => {
  it('continues the newest unfinished local or server snapshot', () => {
    const older = createRun('OLDER-SAVE');
    older.updatedAt = '2026-08-20T01:00:00.000Z';
    const newer = createRun('NEWER-SAVE');
    newer.updatedAt = '2026-08-20T02:00:00.000Z';

    expect(latestResumableRun(older, newer)?.seed).toBe('NEWER-SAVE');
    newer.phase = RunPhase.Victory;
    expect(latestResumableRun(older, newer)?.seed).toBe('OLDER-SAVE');
    older.phase = RunPhase.Defeat;
    expect(latestResumableRun(older, newer)).toBeUndefined();
  });
});
