import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, DEFAULT_UNLOCKS, ITEMS } from '../catalog.js';
import {
  AchievementBossId,
  AchievementEventType,
  AchievementId,
  AchievementMetric,
  AchievementPlatform,
} from '../domain/enums.js';
import { acknowledgeAchievementNotice, createRun } from '../engine.js';
import { migrateProfileState } from '../state/migrations.js';
import { ACHIEVEMENT_DEFINITIONS, ACHIEVEMENT_REWARD_ITEM_IDS } from './catalog.js';
import {
  createAchievementProgress,
  markPlatformAchievementsSynced,
  mergeAchievementProgress,
  pendingPlatformUnlocks,
  recordAchievementEvent,
} from './tracker.js';

describe('achievement progression', () => {
  it('uses unique platform keys and valid, initially locked reward items', () => {
    expect(ACHIEVEMENT_DEFINITIONS).toHaveLength(36);
    expect(new Set(ACHIEVEMENT_DEFINITIONS.map((entry) => entry.id)).size).toBe(36);
    expect(new Set(ACHIEVEMENT_DEFINITIONS.map((entry) => entry.steamKey)).size).toBe(36);
    for (const itemId of ACHIEVEMENT_REWARD_ITEM_IDS) {
      expect(ITEMS[itemId], itemId).toBeDefined();
      expect(DEFAULT_UNLOCKS, itemId).not.toContain(itemId);
    }
    expect(DEFAULT_UNLOCKS).toContain('d6');
  });

  it('unlocks boss milestones and their item bundles through one typed event', () => {
    const run = createRun('ACH-MOM');
    recordAchievementEvent(run, {
      type: AchievementEventType.BossDefeated,
      bossId: AchievementBossId.MomLeg,
    });
    expect(run.achievementState.completedIds).toContain(AchievementId.BasementAwakening);
    expect(run.achievementState.completedIds).toContain(AchievementId.MomLeg);
    expect(run.unlocks).toEqual(expect.arrayContaining(['brimstone', 'moms-knife']));
    expect(run.achievementNotices.at(-1)?.achievementId).toBe(AchievementId.MomLeg);
  });

  it('keeps notices pending until the player explicitly acknowledges them', () => {
    const run = createRun('ACH-PERSISTENT-NOTICE');
    recordAchievementEvent(run, {
      type: AchievementEventType.BossDefeated,
      bossId: AchievementBossId.Monstro,
    });
    const next = acknowledgeAchievementNotice(run, AchievementId.BasementAwakening);

    expect(run.achievementNotices[0]?.acknowledgedAt).toBeUndefined();
    expect(next.achievementNotices[0]?.acknowledgedAt).toBeTruthy();
    expect(() => acknowledgeAchievementNotice(next, AchievementId.BasementAwakening)).toThrow(
      /pending achievement/i,
    );
  });

  it('tracks cumulative sacrifices and unlocks thresholds without hard-coded item branches', () => {
    const run = createRun('ACH-SACRIFICE');
    recordAchievementEvent(run, { type: AchievementEventType.HealthSacrificed, amount: 15 });
    expect(run.achievementState.completedIds).not.toContain(AchievementId.SacrificeNovice);
    recordAchievementEvent(run, { type: AchievementEventType.HealthSacrificed, amount: 15 });
    expect(run.achievementState.completedIds).toContain(AchievementId.SacrificeNovice);
    expect(run.unlocks).toContain('razor-blade');
  });

  it('evaluates Slay-the-Spire-style victory constraints from final run facts', () => {
    const run = createRun('ACH-MINIMAL');
    run.player.deck = run.player.deck.slice(0, 12);
    recordAchievementEvent(run, { type: AchievementEventType.RunWon });
    expect(run.achievementState.completedIds).toContain(AchievementId.Minimalist);
    expect(run.achievementState.completedIds).toContain(AchievementId.SpeedClimber);
    expect(run.unlocks).toEqual(expect.arrayContaining(['bag-of-crafting', 'stop-watch']));
  });

  it('merges repeatedly saved run counters idempotently', () => {
    const run = createRun('ACH-IDEMPOTENT');
    recordAchievementEvent(run, { type: AchievementEventType.CardPlayed });
    recordAchievementEvent(run, { type: AchievementEventType.CardPlayed });
    const first = mergeAchievementProgress(DEFAULT_PROFILE.achievementProgress, run.achievementState);
    const repeated = mergeAchievementProgress(first, run.achievementState);
    expect(repeated.lifetimeCounters[AchievementMetric.CardsPlayed]).toBe(2);
  });

  it('exposes an outbox-like Steam synchronization difference', () => {
    const progress = createAchievementProgress({
      completedIds: [AchievementId.MomLeg, AchievementId.BasementAwakening],
    });
    const pending = pendingPlatformUnlocks(progress, AchievementPlatform.Steam);
    expect(pending).toHaveLength(2);
    expect(pending.every((entry) => entry.platformKey.startsWith('ACH_'))).toBe(true);
    const synced = markPlatformAchievementsSynced(
      progress,
      AchievementPlatform.Steam,
      pending.map((entry) => entry.achievementId),
    );
    expect(pendingPlatformUnlocks(synced, AchievementPlatform.Steam)).toHaveLength(0);
  });

  it('migrates profiles created before achievements existed', () => {
    const legacy = structuredClone(DEFAULT_PROFILE);
    delete (legacy as Partial<typeof legacy>).achievementProgress;
    const migrated = migrateProfileState(legacy);
    expect(migrated.achievementProgress.completedIds).toEqual([]);
    expect(migrated.achievementProgress.lifetimeCounters).toEqual({});
  });
});
