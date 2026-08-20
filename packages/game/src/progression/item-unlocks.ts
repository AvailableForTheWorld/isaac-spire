import type { AchievementDefinition } from '../domain/achievement.js';
import {
  AchievementCategory,
  AchievementTier,
  ItemEffectFamily,
  ItemKind,
  ItemMechanic,
  RewardPool,
  RewardQuality,
} from '../domain/enums.js';
import type { AchievementId } from '../domain/enums.js';
import type { ItemDefinition } from '../domain/player.js';

export const INITIAL_ITEM_UNLOCK_RATIO = 1 / 3;
export const CURRENT_ITEM_UNLOCK_PROGRESSION_VERSION = 1;

/**
 * A deliberately small set of authored guarantees for a first profile.
 * The rest of the initial pool is selected by the balanced, deterministic
 * allocator below, so adding collectibles does not require maintaining a
 * second hand-written manifest.
 */
export const FIRST_RUN_CORE_ITEM_IDS = [
  // Isaac and the 15-card starter deck must always remain valid.
  'd6',
  'battery-pack',
  'starter-deck',
  'the-common-cold',
  'sad-onion',
  // A few exciting high rolls let a fresh profile finish the Mom route.
  'crickets-head',
  'magic-mushroom',
  'revelation',
  // Guaranteed coverage for the special-room reward pools.
  'squeezy',
  'terra',
  'luna',
  'ceremonial-robes',
  'blank-book',
  'strong-stimulant',
  'crystal-ball',
  'small-rock',
  'spoon-bender',
  'the-body',
  'binky',
  'black-candle',
  'neptunus',
] as const;

export interface ItemUnlockProgression {
  initialItemIds: readonly string[];
  lockedItemIds: readonly string[];
  achievementItemIds: Readonly<Record<AchievementId, readonly string[]>>;
}

const QUALITY_SHARE: Readonly<Partial<Record<RewardQuality, number>>> = {
  [RewardQuality.Poor]: 0.08,
  [RewardQuality.Common]: 0.29,
  [RewardQuality.Uncommon]: 0.43,
};

const TIER_RANK: Readonly<Record<AchievementTier, number>> = {
  [AchievementTier.Bronze]: 0,
  [AchievementTier.Silver]: 1,
  [AchievementTier.Gold]: 2,
  [AchievementTier.Platinum]: 3,
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function itemBucket(item: ItemDefinition): string {
  return `${item.kind}:${item.family ?? item.originalMechanics?.[0] ?? 'general'}`;
}

function firstRunPriority(item: ItemDefinition): number {
  let score = Math.min(5, item.pool.length) * 4;
  if (item.combatCard !== false) score += 3;
  if (item.fusion) score += 7;
  if (item.family === ItemEffectFamily.Draw || item.family === ItemEffectFamily.Cycle) score += 8;
  if (item.family === ItemEffectFamily.Familiar) score += 5;
  if (item.family === ItemEffectFamily.Assault || item.family === ItemEffectFamily.Volley) score += 4;
  if (item.family === ItemEffectFamily.Defense || item.family === ItemEffectFamily.Sustain) score += 4;
  if (item.originalMechanics?.includes(ItemMechanic.Deck)) score += 5;
  if (item.originalMechanics?.includes(ItemMechanic.Familiar)) score += 4;
  if (item.originalMechanics?.includes(ItemMechanic.RiskReward)) score -= 4;
  if (item.kind === ItemKind.Active) score -= 2;
  return score;
}

function selectBalanced(
  candidates: readonly ItemDefinition[],
  requested: number,
  selected: Set<string>,
): void {
  if (requested <= 0) return;
  const buckets = new Map<string, ItemDefinition[]>();
  for (const item of candidates) {
    if (selected.has(item.id)) continue;
    const key = itemBucket(item);
    const bucket = buckets.get(key) ?? [];
    bucket.push(item);
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) {
    bucket.sort(
      (left, right) =>
        firstRunPriority(right) - firstRunPriority(left) ||
        stableHash(left.id) - stableHash(right.id) ||
        left.id.localeCompare(right.id),
    );
  }

  const pickedByBucket = new Map<string, number>();
  let remaining = requested;
  while (remaining > 0) {
    const available = [...buckets.entries()].filter(([, bucket]) => bucket.length > 0);
    if (!available.length) break;
    available.sort(([leftKey, left], [rightKey, right]) => {
      const leftPicked = pickedByBucket.get(leftKey) ?? 0;
      const rightPicked = pickedByBucket.get(rightKey) ?? 0;
      const leftFairness = leftPicked / Math.sqrt(leftPicked + left.length);
      const rightFairness = rightPicked / Math.sqrt(rightPicked + right.length);
      return leftFairness - rightFairness || leftKey.localeCompare(rightKey);
    });
    const [key, bucket] = available[0]!;
    const item = bucket.shift()!;
    selected.add(item.id);
    pickedByBucket.set(key, (pickedByBucket.get(key) ?? 0) + 1);
    remaining -= 1;
  }
}

function initialQualityTargets(target: number, items: readonly ItemDefinition[]): Map<RewardQuality, number> {
  const mandatoryCounts = new Map<RewardQuality, number>();
  const coreIds = new Set<string>(FIRST_RUN_CORE_ITEM_IDS);
  for (const item of items) {
    if (coreIds.has(item.id)) {
      mandatoryCounts.set(item.quality, (mandatoryCounts.get(item.quality) ?? 0) + 1);
    }
  }
  const targets = new Map<RewardQuality, number>();
  for (const quality of [RewardQuality.Poor, RewardQuality.Common, RewardQuality.Uncommon]) {
    targets.set(
      quality,
      Math.max(mandatoryCounts.get(quality) ?? 0, Math.round(target * (QUALITY_SHARE[quality] ?? 0))),
    );
  }
  targets.set(RewardQuality.Legendary, mandatoryCounts.get(RewardQuality.Legendary) ?? 0);
  const reserved = [...targets.values()].reduce((sum, count) => sum + count, 0);
  targets.set(RewardQuality.Rare, Math.max(mandatoryCounts.get(RewardQuality.Rare) ?? 0, target - reserved));
  return targets;
}

function preferredCategories(item: ItemDefinition): ReadonlySet<AchievementCategory> {
  const categories = new Set<AchievementCategory>();
  const pools = new Set(item.pool);
  if (
    pools.has(RewardPool.Shop) ||
    pools.has(RewardPool.Arcade) ||
    item.family === ItemEffectFamily.Economy ||
    item.originalMechanics?.includes(ItemMechanic.Economy)
  ) {
    categories.add(AchievementCategory.Economy);
  }
  if (
    pools.has(RewardPool.Secret) ||
    pools.has(RewardPool.SuperSecret) ||
    pools.has(RewardPool.Planetarium) ||
    pools.has(RewardPool.Dice) ||
    pools.has(RewardPool.Crawlspace) ||
    pools.has(RewardPool.Error) ||
    item.family === ItemEffectFamily.Mapping ||
    item.originalMechanics?.includes(ItemMechanic.Map)
  ) {
    categories.add(AchievementCategory.Exploration);
  }
  if (
    pools.has(RewardPool.Sacrifice) ||
    pools.has(RewardPool.Devil) ||
    pools.has(RewardPool.Curse) ||
    item.originalMechanics?.includes(ItemMechanic.RiskReward)
  ) {
    categories.add(AchievementCategory.Sacrifice);
  }
  if (
    item.family === ItemEffectFamily.Draw ||
    item.family === ItemEffectFamily.Cycle ||
    item.family === ItemEffectFamily.Reroll ||
    item.originalMechanics?.includes(ItemMechanic.Deck) ||
    item.originalMechanics?.includes(ItemMechanic.Reroll)
  ) {
    categories.add(AchievementCategory.Deckbuilding);
  }
  if (
    pools.has(RewardPool.Elite) ||
    pools.has(RewardPool.Boss) ||
    item.family === ItemEffectFamily.Assault ||
    item.family === ItemEffectFamily.Volley ||
    item.family === ItemEffectFamily.Familiar ||
    item.originalMechanics?.includes(ItemMechanic.Attack) ||
    item.originalMechanics?.includes(ItemMechanic.Familiar)
  ) {
    categories.add(AchievementCategory.Combat);
  }
  if (pools.has(RewardPool.Angel) || item.quality >= RewardQuality.Rare) {
    categories.add(AchievementCategory.Challenge);
  }
  if (!categories.size) categories.add(AchievementCategory.Progression);
  return categories;
}

function idealTierRank(item: ItemDefinition): number {
  switch (item.quality) {
    case RewardQuality.Poor:
    case RewardQuality.Common:
      return TIER_RANK[AchievementTier.Bronze];
    case RewardQuality.Uncommon:
      return TIER_RANK[AchievementTier.Silver];
    case RewardQuality.Rare:
      return TIER_RANK[AchievementTier.Gold];
    case RewardQuality.Legendary:
      return TIER_RANK[AchievementTier.Platinum];
  }
}

function achievementAllocationScore(
  item: ItemDefinition,
  achievement: AchievementDefinition,
  currentCount: number,
  bundleCapacity: number,
): number {
  const tierDistance = Math.abs(TIER_RANK[achievement.tier] - idealTierRank(item));
  const categoryPenalty = preferredCategories(item).has(achievement.category) ? 0 : 24;
  const loadPenalty = currentCount >= bundleCapacity ? 10_000 + currentCount * 100 : currentCount * 3;
  const tieBreaker = stableHash(`${item.id}:${achievement.id}`) % 11;
  return tierDistance * 100 + categoryPenalty + loadPenalty + tieBreaker;
}

export function buildItemUnlockProgression(
  itemCatalog: Readonly<Record<string, ItemDefinition>>,
  achievements: readonly AchievementDefinition[],
): ItemUnlockProgression {
  const items = Object.values(itemCatalog).sort((left, right) => left.id.localeCompare(right.id));
  const itemIds = new Set(items.map((item) => item.id));
  const featuredOwners = new Map<string, AchievementId>();
  for (const achievement of achievements) {
    for (const itemId of achievement.rewardItemIds) {
      if (!itemIds.has(itemId))
        throw new Error(`Achievement ${achievement.id} references unknown item ${itemId}`);
      if (featuredOwners.has(itemId)) throw new Error(`Item ${itemId} is rewarded by multiple achievements`);
      featuredOwners.set(itemId, achievement.id);
    }
  }

  const initialTarget = Math.max(
    FIRST_RUN_CORE_ITEM_IDS.length,
    Math.round(items.length * INITIAL_ITEM_UNLOCK_RATIO),
  );
  const selected = new Set<string>();
  for (const itemId of FIRST_RUN_CORE_ITEM_IDS) {
    const item = itemCatalog[itemId];
    if (!item) throw new Error(`First-run core item ${itemId} does not exist`);
    if (item.unlock || featuredOwners.has(itemId)) {
      throw new Error(`First-run core item ${itemId} is also achievement locked`);
    }
    selected.add(itemId);
  }

  const candidates = items.filter(
    (item) =>
      !item.unlock &&
      !featuredOwners.has(item.id) &&
      (item.quality !== RewardQuality.Legendary || selected.has(item.id)),
  );
  const qualityTargets = initialQualityTargets(initialTarget, items);
  for (const quality of Object.values(RewardQuality).filter(
    (value): value is RewardQuality => typeof value === 'number',
  )) {
    const selectedAtQuality = items.filter(
      (item) => item.quality === quality && selected.has(item.id),
    ).length;
    selectBalanced(
      candidates.filter((item) => item.quality === quality),
      Math.max(0, (qualityTargets.get(quality) ?? 0) - selectedAtQuality),
      selected,
    );
  }
  if (selected.size < initialTarget) {
    selectBalanced(candidates, initialTarget - selected.size, selected);
  }
  if (selected.size !== initialTarget) {
    throw new Error(`Unable to build ${initialTarget}-item first-run pool; selected ${selected.size}`);
  }

  const achievementItems = new Map<AchievementId, string[]>();
  for (const achievement of achievements) {
    achievementItems.set(achievement.id, [...achievement.rewardItemIds]);
  }
  const lockedItems = items.filter((item) => !selected.has(item.id));
  const bundleCapacity = Math.ceil(lockedItems.length / Math.max(1, achievements.length));
  for (const item of lockedItems) {
    if (featuredOwners.has(item.id)) continue;
    const owner = [...achievements].sort((left, right) => {
      const leftScore = achievementAllocationScore(
        item,
        left,
        achievementItems.get(left.id)?.length ?? 0,
        bundleCapacity,
      );
      const rightScore = achievementAllocationScore(
        item,
        right,
        achievementItems.get(right.id)?.length ?? 0,
        bundleCapacity,
      );
      return leftScore - rightScore || left.id.localeCompare(right.id);
    })[0];
    if (!owner) throw new Error(`No achievement can unlock item ${item.id}`);
    achievementItems.get(owner.id)!.push(item.id);
  }

  const achievementItemIds = Object.fromEntries(
    achievements.map((achievement) => [
      achievement.id,
      [...new Set(achievementItems.get(achievement.id) ?? [])],
    ]),
  ) as unknown as Record<AchievementId, readonly string[]>;
  return {
    initialItemIds: items.filter((item) => selected.has(item.id)).map((item) => item.id),
    lockedItemIds: lockedItems.map((item) => item.id),
    achievementItemIds,
  };
}
