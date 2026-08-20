import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_DEFINITIONS } from '../achievements/catalog.js';
import {
  DEFAULT_PROFILE,
  DEFAULT_UNLOCKS,
  ITEMS,
  ITEM_UNLOCK_PROGRESSION,
  achievementItemUnlocks,
} from '../catalog.js';
import { AchievementId, RewardPool, RewardQuality } from '../domain/enums.js';
import { createRun } from '../engine.js';
import { CURRENT_RUN_VERSION, migrateProfileState, migrateRunSnapshot } from '../state/migrations.js';
import type { ProfileState } from '../types.js';
import {
  CURRENT_ITEM_UNLOCK_PROGRESSION_VERSION,
  FIRST_RUN_CORE_ITEM_IDS,
  INITIAL_ITEM_UNLOCK_RATIO,
} from './item-unlocks.js';

describe('item unlock progression', () => {
  it('starts a fresh profile with exactly one third of the collectible catalog', () => {
    const total = Object.keys(ITEMS).length;
    expect(DEFAULT_UNLOCKS).toHaveLength(Math.round(total * INITIAL_ITEM_UNLOCK_RATIO));
    expect(new Set(DEFAULT_UNLOCKS).size).toBe(DEFAULT_UNLOCKS.length);
    expect(DEFAULT_PROFILE.unlockedItemIds).toEqual(DEFAULT_UNLOCKS);
    expect(DEFAULT_UNLOCKS).toEqual(expect.arrayContaining([...FIRST_RUN_CORE_ITEM_IDS]));
  });

  it('keeps most rare power behind progression while retaining first-run high rolls', () => {
    const powerful = Object.values(ITEMS).filter((item) => item.quality >= RewardQuality.Rare);
    const initialPowerful = powerful.filter((item) => DEFAULT_UNLOCKS.includes(item.id));
    const initialLegendary = initialPowerful.filter((item) => item.quality === RewardQuality.Legendary);
    expect(initialPowerful.length / powerful.length).toBeLessThan(0.25);
    expect(initialLegendary.map((item) => item.id).sort()).toEqual(
      ['crickets-head', 'd6', 'magic-mushroom', 'revelation'].sort(),
    );
  });

  it('gives every obtainable room pool at least one strong first-run reward', () => {
    const initial = new Set(DEFAULT_UNLOCKS);
    for (const pool of Object.values(RewardPool).filter((value) => value !== RewardPool.FloorStart)) {
      const available = Object.values(ITEMS).filter(
        (item) => initial.has(item.id) && item.pool.includes(pool) && item.quality >= RewardQuality.Rare,
      );
      expect(available.length, pool).toBeGreaterThan(0);
    }
  });

  it('assigns every locked item to one achievement without losing featured rewards', () => {
    const assigned = Object.values(ITEM_UNLOCK_PROGRESSION.achievementItemIds).flat();
    expect(assigned).toHaveLength(ITEM_UNLOCK_PROGRESSION.lockedItemIds.length);
    expect(new Set(assigned).size).toBe(assigned.length);
    expect(new Set([...DEFAULT_UNLOCKS, ...assigned]).size).toBe(Object.keys(ITEMS).length);
    for (const definition of ACHIEVEMENT_DEFINITIONS) {
      expect(achievementItemUnlocks(definition.id)).toEqual(expect.arrayContaining(definition.rewardItemIds));
    }
  });

  it('backfills expanded reward bundles from completed achievements on a new run', () => {
    const profile = structuredClone(DEFAULT_PROFILE);
    profile.unlockedItemIds = [];
    profile.achievementProgress.completedIds = [AchievementId.BasementAwakening];
    const run = createRun('ACHIEVEMENT-BACKFILL', profile);
    expect(run.unlocks).toEqual(
      expect.arrayContaining([...achievementItemUnlocks(AchievementId.BasementAwakening)]),
    );
  });

  it('rebases legacy open-catalog profiles without losing earned achievements or statistics', () => {
    const legacy = structuredClone(DEFAULT_PROFILE);
    delete (legacy as Partial<ProfileState>).itemUnlockProgressionVersion;
    legacy.bestScore = 1170;
    legacy.unlockedItemIds = Object.keys(ITEMS).slice(0, 724);
    legacy.achievementProgress.completedIds = [
      AchievementId.BasementAwakening,
      AchievementId.CardStudent,
      AchievementId.SacrificeNovice,
    ];

    const migrated = migrateProfileState(legacy);
    const expected = new Set([
      ...DEFAULT_UNLOCKS,
      ...achievementItemUnlocks(AchievementId.BasementAwakening),
      ...achievementItemUnlocks(AchievementId.CardStudent),
      ...achievementItemUnlocks(AchievementId.SacrificeNovice),
    ]);
    expect(migrated.itemUnlockProgressionVersion).toBe(CURRENT_ITEM_UNLOCK_PROGRESSION_VERSION);
    expect(new Set(migrated.unlockedItemIds)).toEqual(expected);
    expect(migrated.unlockedItemIds).toHaveLength(284);
    expect(migrated.bestScore).toBe(1170);
  });

  it('rebases legacy active-run reward pools before they can pollute the migrated profile again', () => {
    const legacyRun = createRun('LEGACY-ACTIVE-RUN');
    legacyRun.version = 4;
    legacyRun.unlocks = Object.keys(ITEMS).slice(0, 724);
    legacyRun.achievementState.completedIds = [AchievementId.BasementAwakening];

    const migrated = migrateRunSnapshot(legacyRun);
    expect(migrated.version).toBe(CURRENT_RUN_VERSION);
    expect(new Set(migrated.unlocks)).toEqual(
      new Set([...DEFAULT_UNLOCKS, ...achievementItemUnlocks(AchievementId.BasementAwakening)]),
    );
  });
});
