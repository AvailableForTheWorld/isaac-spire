import {
  DEFAULT_UNLOCKS,
  ITEMS,
  completedAchievementItemUnlocks,
  itemUsesCombatCard,
  passiveCardId,
} from '../catalog.js';
import { createAchievementProgress, createRunAchievementState } from '../achievements/tracker.js';
import { createFamiliarState, isFamiliarItem } from '../combat/familiars.js';
import { DEFAULT_HEART_SIZE, MAX_RED_CONTAINERS } from '../domain/player.js';
import { addRedContainers, clampPlayerHealth, increaseHeartSize } from '../player.js';
import { CURRENT_ITEM_UNLOCK_PROGRESSION_VERSION } from '../progression/item-unlocks.js';
import type { CombatState, PlayerState, ProfileState, RunState } from '../types.js';
import { AttackMode, ItemKind } from '../types.js';

export const CURRENT_RUN_VERSION = 5;
const LEGACY_HEART_SIZE = 30;

const LEGACY_CARD_IDS: Readonly<Record<string, string>> = {
  'isaacs-tears': 'basic-attack',
  'wide-tears': 'sweeping-attack',
};

function currentCardId(id: string): string {
  return LEGACY_CARD_IDS[id] ?? id;
}

function migrateCompactHeartScale(player: PlayerState): void {
  const previousHeartSize = Math.max(1, player.stats.heartSize ?? LEGACY_HEART_SIZE);
  player.redContainers = Math.max(0, Math.min(MAX_RED_CONTAINERS, Math.round(player.redContainers)));
  const upgradedHeartSize = Math.max(0, previousHeartSize - LEGACY_HEART_SIZE);
  const nextHeartSize = DEFAULT_HEART_SIZE + upgradedHeartSize;
  player.redHp = Math.min(
    player.redContainers * nextHeartSize,
    Math.max(0, Math.round(player.redHp * (nextHeartSize / previousHeartSize))),
  );
  player.stats.heartSize = nextHeartSize;
  player.pocketHearts.forEach((heart) => {
    const previousMaximum = Math.max(1, heart.maxHp);
    const nextMaximum = DEFAULT_HEART_SIZE + Math.max(0, previousMaximum - LEGACY_HEART_SIZE);
    heart.hp = Math.min(nextMaximum, Math.max(0, Math.round(heart.hp * (nextMaximum / previousMaximum))));
    heart.maxHp = nextMaximum;
  });

  for (const itemId of player.items) {
    const item = ITEMS[itemId];
    if (!item || itemUsesCombatCard(item) || !item.effects?.some((effect) => effect.redContainers)) continue;
    for (const effect of item.effects) {
      if (effect.redContainers) {
        addRedContainers(player, effect.redContainers);
      }
      if (!effect.stat) continue;
      const current = player.stats[effect.stat];
      const multiplied = effect.multiplier === undefined ? current : current * effect.multiplier;
      player.stats[effect.stat] = multiplied + (effect.amount ?? 0);
    }
  }
}

function migratePermanentHeartSizeItems(player: PlayerState): void {
  for (const itemId of player.items) {
    const item = ITEMS[itemId];
    if (!item || itemUsesCombatCard(item)) continue;
    for (const effect of item.effects ?? []) {
      if (effect.heartSize) increaseHeartSize(player, effect.heartSize);
    }
  }
}

/**
 * Pure, idempotent save migration. Schema-specific migrations can be appended
 * here as the game gains acts and multiplayer state.
 */
export function migrateRunSnapshot(state: RunState): RunState {
  const run = structuredClone(state);
  const previousVersion = run.version ?? 1;
  if (previousVersion < 2) {
    migrateCompactHeartScale(run.player);
    if (run.roomCheckpoint) migrateCompactHeartScale(run.roomCheckpoint.player);
  }
  if (previousVersion < 3) {
    migratePermanentHeartSizeItems(run.player);
    if (run.roomCheckpoint) migratePermanentHeartSizeItems(run.roomCheckpoint.player);
  }
  if (previousVersion < 5 && run.unlocks.length >= Math.floor(Object.keys(ITEMS).length * 0.8)) {
    run.unlocks = [
      ...new Set([
        ...DEFAULT_UNLOCKS,
        ...completedAchievementItemUnlocks(run.achievementState?.completedIds ?? []),
      ]),
    ];
  }
  clampPlayerHealth(run.player);
  if (run.roomCheckpoint) clampPlayerHealth(run.roomCheckpoint.player);
  run.version = CURRENT_RUN_VERSION;
  run.achievementState = {
    ...createRunAchievementState(run.achievementState),
    runCounters: { ...(run.achievementState?.runCounters ?? {}) },
  };
  run.achievementNotices ??= [];
  run.floorBombSearches ??= [];
  run.player.pocketItems ??= [];
  run.player.pocketItemSlots ??= 3;
  run.player.deck.forEach((card) => {
    card.definitionId = currentCardId(card.definitionId);
  });
  if ((run.player.stats.attackMode as string) === 'tears') run.player.stats.attackMode = AttackMode.Basic;
  run.choice?.options.forEach((option) => {
    if (option.cardId) option.cardId = currentCardId(option.cardId);
  });

  if (run.combat) {
    const legacyCombat = run.combat as CombatState & { tearMeter?: number };
    legacyCombat.playerStatuses ??= {};
    legacyCombat.playerStatusPower ??= {};
    legacyCombat.cardDefinitionOverrides ??= {};
    legacyCombat.temporaryCardIds ??= [];
    legacyCombat.blankBookActive ??= false;
    legacyCombat.damoclesActive ??= false;
    legacyCombat.damoclesFallen ??= false;
    legacyCombat.ragnarokActive ??= false;
    legacyCombat.unlimitedVitalityTurns ??= 0;
    legacyCombat.usedPassiveItems ??= [];
    legacyCombat.itemActionCounters ??= {};
    legacyCombat.usedItemActions ??= [];
    legacyCombat.observedDefeatIds ??= [];
    legacyCombat.statFloorLocked ??= false;
    legacyCombat.activeEffectRepeats ??= 0;
    legacyCombat.familiars ??= run.player.items
      .map((itemId) => ITEMS[itemId])
      .filter(isFamiliarItem)
      .map((item, index) =>
        createFamiliarState(item, index, run.player.stats.baseDamage, run.player.stats.damageMultiplier),
      );
    legacyCombat.curvedShotsOverride ??= false;
    legacyCombat.playerDodgeChanceBuff ??= 0;
    legacyCombat.enemies.forEach((enemy) => {
      enemy.statuses ??= {};
    });
    legacyCombat.attackMeter ??= legacyCombat.tearMeter ?? 0;
    delete legacyCombat.tearMeter;
    if ((legacyCombat.attackModeOverride as string | undefined) === 'tears')
      legacyCombat.attackModeOverride = AttackMode.Basic;
    (legacyCombat.animationEvents ?? []).forEach((event) => {
      if ((event.attackMode as string | undefined) === 'tears') event.attackMode = AttackMode.Basic;
    });
    (legacyCombat.log ?? []).forEach((entry) => {
      if (typeof entry.params?.cardId === 'string') entry.params.cardId = currentCardId(entry.params.cardId);
      if (entry.params?.mode === 'tears') entry.params.mode = AttackMode.Basic;
    });
  }

  const retiredCardIds = new Set(
    Object.values(ITEMS)
      .filter((item) => item.kind === ItemKind.Passive && !itemUsesCombatCard(item))
      .map((item) => passiveCardId(item.id)),
  );
  const retiredInstances = new Set(
    run.player.deck.filter((card) => retiredCardIds.has(card.definitionId)).map((card) => card.instanceId),
  );
  run.player.deck = run.player.deck.filter((card) => !retiredInstances.has(card.instanceId));

  for (const itemId of run.player.items) {
    const item = ITEMS[itemId];
    if (!item || itemUsesCombatCard(item)) continue;
    for (const effect of item.effects ?? []) {
      if (effect.stat === 'shopDiscount') {
        run.player.stats.shopDiscount = Math.max(run.player.stats.shopDiscount ?? 0, effect.amount ?? 0);
      }
    }
  }

  if (run.combat && retiredInstances.size) {
    run.combat.hand = run.combat.hand.filter((id) => !retiredInstances.has(id));
    run.combat.drawPile = run.combat.drawPile.filter((id) => !retiredInstances.has(id));
    run.combat.discardPile = run.combat.discardPile.filter((id) => !retiredInstances.has(id));
    run.combat.exhausted = run.combat.exhausted.filter((id) => !retiredInstances.has(id));
    retiredInstances.forEach((id) => {
      delete run.combat!.cooldowns[id];
    });
  }
  return run;
}

export function migrateProfileState(state: ProfileState): ProfileState {
  const profile = structuredClone(state);
  profile.wins ??= 0;
  profile.losses ??= 0;
  profile.bestScore ??= 0;
  profile.unlockedItemIds ??= [];
  profile.discoveredItemIds ??= [];
  profile.eventFlags ??= [];
  profile.achievementProgress = createAchievementProgress(profile.achievementProgress);
  const completedUnlocks = completedAchievementItemUnlocks(profile.achievementProgress.completedIds);
  const legacyOpenCatalog =
    (profile.itemUnlockProgressionVersion ?? 0) < CURRENT_ITEM_UNLOCK_PROGRESSION_VERSION &&
    profile.unlockedItemIds.length >= Math.floor(Object.keys(ITEMS).length * 0.8);
  profile.unlockedItemIds = [
    ...new Set([
      ...DEFAULT_UNLOCKS,
      ...(legacyOpenCatalog ? [] : profile.unlockedItemIds),
      ...completedUnlocks,
    ]),
  ];
  profile.itemUnlockProgressionVersion = CURRENT_ITEM_UNLOCK_PROGRESSION_VERSION;
  return profile;
}
