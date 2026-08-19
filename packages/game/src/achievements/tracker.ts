import { CARDS, ITEMS } from '../catalog.js';
import type {
  AchievementDefinition,
  AchievementEvent,
  AchievementPlatformUnlock,
  AchievementProgressState,
  AchievementRequirement,
  RunAchievementState,
} from '../domain/achievement.js';
import {
  AchievementBossId,
  AchievementComparison,
  AchievementEventType,
  AchievementMetric,
  AchievementScope,
  CardType,
  ItemKind,
  RewardQuality,
} from '../domain/enums.js';
import type { AchievementId, AchievementPlatform } from '../domain/enums.js';
import type { RunState } from '../domain/run.js';
import { ACHIEVEMENTS, ACHIEVEMENT_DEFINITIONS } from './catalog.js';

const BOSS_METRICS: Partial<Record<AchievementBossId, AchievementMetric>> = {
  [AchievementBossId.MomLeg]: AchievementMetric.MomLegKills,
  [AchievementBossId.MomHeart]: AchievementMetric.MomHeartKills,
  [AchievementBossId.ItLives]: AchievementMetric.ItLivesKills,
  [AchievementBossId.Isaac]: AchievementMetric.IsaacKills,
  [AchievementBossId.Satan]: AchievementMetric.SatanKills,
  [AchievementBossId.BlueBaby]: AchievementMetric.BlueBabyKills,
};

const ACHIEVEMENTS_BY_METRIC = new Map<AchievementMetric, AchievementDefinition[]>();
for (const definition of ACHIEVEMENT_DEFINITIONS) {
  for (const requirement of definition.requirements) {
    const entries = ACHIEVEMENTS_BY_METRIC.get(requirement.metric) ?? [];
    entries.push(definition);
    ACHIEVEMENTS_BY_METRIC.set(requirement.metric, entries);
  }
}

export function createAchievementProgress(
  progress?: Partial<AchievementProgressState>,
): AchievementProgressState {
  return {
    completedIds: [...new Set(progress?.completedIds ?? [])],
    completedAt: { ...(progress?.completedAt ?? {}) },
    lifetimeCounters: { ...(progress?.lifetimeCounters ?? {}) },
    platformSyncedIds: Object.fromEntries(
      Object.entries(progress?.platformSyncedIds ?? {}).map(([platform, ids]) => [
        platform,
        [...new Set(ids ?? [])],
      ]),
    ),
  };
}

export function createRunAchievementState(progress?: Partial<AchievementProgressState>): RunAchievementState {
  return {
    ...createAchievementProgress(progress),
    runCounters: {},
  };
}

export function mergeAchievementProgress(
  current: AchievementProgressState,
  incoming: AchievementProgressState,
): AchievementProgressState {
  const completedIds = [...new Set([...current.completedIds, ...incoming.completedIds])];
  const lifetimeCounters = { ...current.lifetimeCounters };
  for (const metric of Object.values(AchievementMetric)) {
    lifetimeCounters[metric] = Math.max(
      lifetimeCounters[metric] ?? 0,
      incoming.lifetimeCounters[metric] ?? 0,
    );
  }
  const completedAt = { ...current.completedAt };
  for (const id of completedIds) {
    const times = [current.completedAt[id], incoming.completedAt[id]].filter((time): time is string =>
      Boolean(time),
    );
    if (times.length) completedAt[id] = times.sort()[0];
  }
  const platforms = new Set([
    ...Object.keys(current.platformSyncedIds),
    ...Object.keys(incoming.platformSyncedIds),
  ] as AchievementPlatform[]);
  const platformSyncedIds: AchievementProgressState['platformSyncedIds'] = {};
  for (const platform of platforms) {
    platformSyncedIds[platform] = [
      ...new Set([
        ...(current.platformSyncedIds[platform] ?? []),
        ...(incoming.platformSyncedIds[platform] ?? []),
      ]),
    ];
  }
  return { completedIds, completedAt, lifetimeCounters, platformSyncedIds };
}

function counter(state: RunAchievementState, requirement: AchievementRequirement): number {
  return requirement.scope === AchievementScope.Lifetime
    ? (state.lifetimeCounters[requirement.metric] ?? 0)
    : (state.runCounters[requirement.metric] ?? 0);
}

function requirementMet(state: RunAchievementState, requirement: AchievementRequirement): boolean {
  const value = counter(state, requirement);
  switch (requirement.comparison) {
    case AchievementComparison.AtLeast:
      return value >= requirement.target;
    case AchievementComparison.AtMost:
      return value <= requirement.target;
    case AchievementComparison.Equal:
      return value === requirement.target;
  }
}

function unlockAchievement(run: RunState, definition: AchievementDefinition): void {
  if (run.achievementState.completedIds.includes(definition.id)) return;
  const completedAt = new Date().toISOString();
  run.achievementState.completedIds.push(definition.id);
  run.achievementState.completedAt[definition.id] = completedAt;
  const newRewards = definition.rewardItemIds.filter((id) => !run.unlocks.includes(id));
  run.unlocks.push(...newRewards);
  run.achievementNotices.push({
    achievementId: definition.id,
    rewardItemIds: newRewards,
    completedAt,
  });
  for (const itemId of newRewards) {
    run.unlockNotices.push({
      itemId,
      label: `${itemId} unlocked by ${definition.name}`,
    });
  }
  run.achievementNotices = run.achievementNotices.slice(-64);
}

function evaluateCandidates(run: RunState, changed: ReadonlySet<AchievementMetric>): void {
  const candidates = new Map<AchievementId, AchievementDefinition>();
  for (const metric of changed) {
    for (const definition of ACHIEVEMENTS_BY_METRIC.get(metric) ?? []) {
      candidates.set(definition.id, definition);
    }
  }
  for (const definition of candidates.values()) {
    if (
      !run.achievementState.completedIds.includes(definition.id) &&
      definition.requirements.every((requirement) => requirementMet(run.achievementState, requirement))
    ) {
      unlockAchievement(run, definition);
    }
  }
}

function increment(
  state: RunAchievementState,
  changed: Set<AchievementMetric>,
  metric: AchievementMetric,
  amount = 1,
): void {
  if (amount <= 0) return;
  state.lifetimeCounters[metric] = (state.lifetimeCounters[metric] ?? 0) + amount;
  state.runCounters[metric] = (state.runCounters[metric] ?? 0) + amount;
  changed.add(metric);
}

function setRun(
  state: RunAchievementState,
  changed: Set<AchievementMetric>,
  metric: AchievementMetric,
  value: number,
): void {
  state.runCounters[metric] = value;
  changed.add(metric);
}

function maximize(
  state: RunAchievementState,
  changed: Set<AchievementMetric>,
  metric: AchievementMetric,
  value: number,
): void {
  const lifetime = Math.max(state.lifetimeCounters[metric] ?? 0, value);
  const run = Math.max(state.runCounters[metric] ?? 0, value);
  if (lifetime !== state.lifetimeCounters[metric] || run !== state.runCounters[metric]) {
    state.lifetimeCounters[metric] = lifetime;
    state.runCounters[metric] = run;
    changed.add(metric);
  }
}

export function evaluateAchievementSnapshot(run: RunState): void {
  const state = run.achievementState;
  const changed = new Set<AchievementMetric>();
  maximize(state, changed, AchievementMetric.MaxCoinsHeld, run.player.coins);
  if (run.combat) {
    maximize(state, changed, AchievementMetric.MaxShield, run.combat.playerShield);
    maximize(state, changed, AchievementMetric.MaxVitality, run.combat.vitality);
  }
  evaluateCandidates(run, changed);
}

export function evaluateAllAchievements(run: RunState): void {
  evaluateCandidates(run, new Set(Object.values(AchievementMetric)));
  evaluateAchievementSnapshot(run);
}

export function recordAchievementEvent(run: RunState, event: AchievementEvent): void {
  const state = run.achievementState;
  const changed = new Set<AchievementMetric>();
  switch (event.type) {
    case AchievementEventType.EnemyKilled:
      increment(state, changed, AchievementMetric.EnemiesKilled);
      if (event.elite) increment(state, changed, AchievementMetric.ElitesKilled);
      break;
    case AchievementEventType.ElitePerfect:
      increment(state, changed, AchievementMetric.PerfectElites);
      break;
    case AchievementEventType.BossDefeated: {
      increment(state, changed, AchievementMetric.BossesDefeated);
      const bossMetric = BOSS_METRICS[event.bossId];
      if (bossMetric) increment(state, changed, bossMetric);
      break;
    }
    case AchievementEventType.RoomCleared:
      increment(state, changed, AchievementMetric.RoomsCleared);
      break;
    case AchievementEventType.FloorCleared:
      increment(state, changed, AchievementMetric.FloorsCleared);
      if (event.flawless) increment(state, changed, AchievementMetric.FlawlessFloors);
      break;
    case AchievementEventType.CoinsSpent:
      increment(state, changed, AchievementMetric.CoinsSpent, event.amount);
      break;
    case AchievementEventType.HealthSacrificed:
      increment(state, changed, AchievementMetric.SacrificeHp, event.amount);
      break;
    case AchievementEventType.SecretRoomEntered:
      increment(state, changed, AchievementMetric.SecretRoomsEntered);
      break;
    case AchievementEventType.BombUsed:
      increment(state, changed, AchievementMetric.BombsUsed);
      break;
    case AchievementEventType.CardPlayed: {
      increment(state, changed, AchievementMetric.CardsPlayed);
      const cardsThisTurn = (state.runCounters[AchievementMetric.CardsPlayedThisTurn] ?? 0) + 1;
      setRun(state, changed, AchievementMetric.CardsPlayedThisTurn, cardsThisTurn);
      maximize(state, changed, AchievementMetric.MaxCardsPlayedInTurn, cardsThisTurn);
      break;
    }
    case AchievementEventType.RoundStarted:
      setRun(state, changed, AchievementMetric.CardsPlayedThisTurn, 0);
      break;
    case AchievementEventType.AngelFavorGained:
      increment(state, changed, AchievementMetric.AngelFavorGained, event.amount);
      break;
    case AchievementEventType.DevilDealTaken:
      increment(state, changed, AchievementMetric.DevilDealsTaken);
      break;
    case AchievementEventType.RunWon: {
      increment(state, changed, AchievementMetric.RunsWon);
      setRun(state, changed, AchievementMetric.FinalDeckSize, run.player.deck.length);
      setRun(
        state,
        changed,
        AchievementMetric.FinalItemCount,
        run.player.items.filter((id) => ITEMS[id]?.kind === ItemKind.Passive).length,
      );
      const highestQuality = run.player.deck.reduce((highest, card) => {
        const definition = CARDS[card.definitionId];
        if (!definition || definition.type === CardType.Skill) return highest;
        return Math.max(highest, definition.quality ?? RewardQuality.Poor);
      }, RewardQuality.Poor);
      setRun(state, changed, AchievementMetric.FinalHighestCardQuality, highestQuality);
      setRun(
        state,
        changed,
        AchievementMetric.RunDurationSeconds,
        Math.max(0, Math.floor((Date.now() - Date.parse(run.createdAt)) / 1000)),
      );
      break;
    }
  }
  evaluateCandidates(run, changed);
  evaluateAchievementSnapshot(run);
}

export function achievementRequirementValue(
  progress: AchievementProgressState,
  definition: AchievementDefinition,
): { current: number; target: number } {
  const requirement = definition.requirements.find(
    (entry) =>
      entry.scope === AchievementScope.Lifetime && entry.comparison === AchievementComparison.AtLeast,
  );
  if (!requirement) return { current: progress.completedIds.includes(definition.id) ? 1 : 0, target: 1 };
  return {
    current: Math.min(requirement.target, progress.lifetimeCounters[requirement.metric] ?? 0),
    target: requirement.target,
  };
}

export function pendingPlatformUnlocks(
  progress: AchievementProgressState,
  platform: AchievementPlatform,
): AchievementPlatformUnlock[] {
  const synced = new Set(progress.platformSyncedIds[platform] ?? []);
  return progress.completedIds
    .filter((id) => !synced.has(id))
    .map((achievementId) => ({
      achievementId,
      platform,
      platformKey: ACHIEVEMENTS[achievementId].steamKey,
    }));
}

export function markPlatformAchievementsSynced(
  progress: AchievementProgressState,
  platform: AchievementPlatform,
  achievementIds: readonly AchievementId[],
): AchievementProgressState {
  const next = createAchievementProgress(progress);
  next.platformSyncedIds[platform] = [
    ...new Set([...(next.platformSyncedIds[platform] ?? []), ...achievementIds]),
  ];
  return next;
}
