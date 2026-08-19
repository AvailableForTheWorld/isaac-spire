import { RewardKind, RewardPool, RewardQuality, RewardStrength } from '../domain/enums.js';

export { RewardKind, RewardStrength };

export interface RoomRewardProfile {
  pool: RewardPool;
  strength: RewardStrength;
  offerCount: number;
  pickCount: number;
  rewardKind: RewardKind;
  qualityWeights: Record<RewardQuality, number>;
  design: string;
}

const profile = (
  pool: RewardPool,
  strength: RewardStrength,
  offerCount: number,
  pickCount: number,
  rewardKind: RewardKind,
  qualityWeights: RoomRewardProfile['qualityWeights'],
  design: string,
): RoomRewardProfile => ({
  pool,
  strength,
  offerCount,
  pickCount,
  rewardKind,
  qualityWeights,
  design,
});

/**
 * Central reward budget for every room family. Weights are relative rather than percentages,
 * which lets future content packs add cards without rebalancing a hard-coded 100% table.
 */
export const ROOM_REWARD_PROFILES = {
  [RewardPool.FloorStart]: profile(
    RewardPool.FloorStart,
    RewardStrength.Steady,
    3,
    1,
    RewardKind.Mixed,
    {
      [RewardQuality.Common]: 48,
      [RewardQuality.Uncommon]: 34,
      [RewardQuality.Rare]: 15,
      [RewardQuality.Legendary]: 3,
    },
    'A dependable opening choice; it builds identity without deciding the run.',
  ),
  [RewardPool.RoomClear]: profile(
    RewardPool.RoomClear,
    RewardStrength.Basic,
    3,
    1,
    RewardKind.Card,
    {
      [RewardQuality.Common]: 66,
      [RewardQuality.Uncommon]: 27,
      [RewardQuality.Rare]: 7,
      [RewardQuality.Legendary]: 0,
    },
    'Frequent deck-shaping cards. Quality 4 is excluded so normal fights cannot spike a build.',
  ),
  [RewardPool.Treasure]: profile(
    RewardPool.Treasure,
    RewardStrength.Rare,
    3,
    1,
    RewardKind.Item,
    {
      [RewardQuality.Common]: 26,
      [RewardQuality.Uncommon]: 42,
      [RewardQuality.Rare]: 26,
      [RewardQuality.Legendary]: 6,
    },
    'The baseline item room: quality 2 is expected, with a meaningful quality 3 chance.',
  ),
  [RewardPool.Shop]: profile(
    RewardPool.Shop,
    RewardStrength.Steady,
    5,
    5,
    RewardKind.Mixed,
    {
      [RewardQuality.Common]: 38,
      [RewardQuality.Uncommon]: 38,
      [RewardQuality.Rare]: 20,
      [RewardQuality.Legendary]: 4,
    },
    'Broad but coin-gated. High quality stays possible because its price is the balancing cost.',
  ),
  [RewardPool.Boss]: profile(
    RewardPool.Boss,
    RewardStrength.Rare,
    3,
    1,
    RewardKind.Item,
    {
      [RewardQuality.Common]: 18,
      [RewardQuality.Uncommon]: 39,
      [RewardQuality.Rare]: 34,
      [RewardQuality.Legendary]: 9,
    },
    'A guaranteed run-scaling reward, weighted toward reliable stat and survivability items.',
  ),
  [RewardPool.Elite]: profile(
    RewardPool.Elite,
    RewardStrength.Rare,
    3,
    1,
    RewardKind.Item,
    {
      [RewardQuality.Common]: 10,
      [RewardQuality.Uncommon]: 34,
      [RewardQuality.Rare]: 42,
      [RewardQuality.Legendary]: 14,
    },
    'Optional danger pays above the treasure-room curve and favors combat-defining items.',
  ),
  [RewardPool.Devil]: profile(
    RewardPool.Devil,
    RewardStrength.Powerful,
    3,
    1,
    RewardKind.Item,
    {
      [RewardQuality.Common]: 0,
      [RewardQuality.Uncommon]: 10,
      [RewardQuality.Rare]: 54,
      [RewardQuality.Legendary]: 36,
    },
    'Heart-container payment buys immediate offensive power; quality 1 is excluded.',
  ),
  [RewardPool.Angel]: profile(
    RewardPool.Angel,
    RewardStrength.Exceptional,
    3,
    1,
    RewardKind.Item,
    {
      [RewardQuality.Common]: 0,
      [RewardQuality.Uncommon]: 4,
      [RewardQuality.Rare]: 38,
      [RewardQuality.Legendary]: 58,
    },
    'Delayed access and Devil-room restraint earn the strongest free defensive/offensive pool.',
  ),
  [RewardPool.Planetarium]: profile(
    RewardPool.Planetarium,
    RewardStrength.Powerful,
    3,
    1,
    RewardKind.Item,
    {
      [RewardQuality.Common]: 0,
      [RewardQuality.Uncommon]: 0,
      [RewardQuality.Rare]: 64,
      [RewardQuality.Legendary]: 36,
    },
    'Rare celestial rooms only offer build-defining quality 3–4 items.',
  ),
  [RewardPool.Secret]: profile(
    RewardPool.Secret,
    RewardStrength.Steady,
    3,
    1,
    RewardKind.Mixed,
    {
      [RewardQuality.Common]: 44,
      [RewardQuality.Uncommon]: 38,
      [RewardQuality.Rare]: 15,
      [RewardQuality.Legendary]: 3,
    },
    'One bomb usually returns resources; the item roll is a modest upside.',
  ),
  [RewardPool.SuperSecret]: profile(
    RewardPool.SuperSecret,
    RewardStrength.Rare,
    3,
    1,
    RewardKind.Mixed,
    {
      [RewardQuality.Common]: 16,
      [RewardQuality.Uncommon]: 37,
      [RewardQuality.Rare]: 34,
      [RewardQuality.Legendary]: 13,
    },
    'Harder to route into than a Secret Room and therefore substantially more item-heavy.',
  ),
  [RewardPool.Curse]: profile(
    RewardPool.Curse,
    RewardStrength.Rare,
    2,
    1,
    RewardKind.Item,
    {
      [RewardQuality.Common]: 12,
      [RewardQuality.Uncommon]: 34,
      [RewardQuality.Rare]: 40,
      [RewardQuality.Legendary]: 14,
    },
    'Taking unavoidable red-heart damage purchases a dark, above-average reward.',
  ),
  [RewardPool.Challenge]: profile(
    RewardPool.Challenge,
    RewardStrength.Rare,
    3,
    1,
    RewardKind.Mixed,
    {
      [RewardQuality.Common]: 12,
      [RewardQuality.Uncommon]: 38,
      [RewardQuality.Rare]: 38,
      [RewardQuality.Legendary]: 12,
    },
    'Multi-wave combat earns a strong card or combat item, but not Devil/Angel consistency.',
  ),
  [RewardPool.Library]: profile(
    RewardPool.Library,
    RewardStrength.Rare,
    3,
    1,
    RewardKind.Item,
    {
      [RewardQuality.Common]: 4,
      [RewardQuality.Uncommon]: 38,
      [RewardQuality.Rare]: 45,
      [RewardQuality.Legendary]: 13,
    },
    'Primarily active books; strength is controlled by replacement and recharge opportunity cost.',
  ),
  [RewardPool.Sacrifice]: profile(
    RewardPool.Sacrifice,
    RewardStrength.Steady,
    2,
    1,
    RewardKind.Mixed,
    {
      [RewardQuality.Common]: 28,
      [RewardQuality.Uncommon]: 42,
      [RewardQuality.Rare]: 25,
      [RewardQuality.Legendary]: 5,
    },
    'Early payments grant sustain or Tarot cards; repeated payments may reach holy quality.',
  ),
  [RewardPool.Arcade]: profile(
    RewardPool.Arcade,
    RewardStrength.Steady,
    3,
    1,
    RewardKind.Mixed,
    {
      [RewardQuality.Common]: 50,
      [RewardQuality.Uncommon]: 35,
      [RewardQuality.Rare]: 13,
      [RewardQuality.Legendary]: 2,
    },
    'Repeatable gambling exchanges health or coins for mostly small, economy-oriented gains.',
  ),
  [RewardPool.Vault]: profile(
    RewardPool.Vault,
    RewardStrength.Rare,
    3,
    1,
    RewardKind.Mixed,
    {
      [RewardQuality.Common]: 9,
      [RewardQuality.Uncommon]: 41,
      [RewardQuality.Rare]: 39,
      [RewardQuality.Legendary]: 11,
    },
    'A rare locked cache with concentrated resources and a strong item/card selection.',
  ),
  [RewardPool.Bedroom]: profile(
    RewardPool.Bedroom,
    RewardStrength.Steady,
    2,
    1,
    RewardKind.Mixed,
    {
      [RewardQuality.Common]: 55,
      [RewardQuality.Uncommon]: 34,
      [RewardQuality.Rare]: 10,
      [RewardQuality.Legendary]: 1,
    },
    'Primarily healing and modest permanent growth; the room is safe rather than explosive.',
  ),
  [RewardPool.Dice]: profile(
    RewardPool.Dice,
    RewardStrength.Rare,
    1,
    1,
    RewardKind.Transform,
    {
      [RewardQuality.Common]: 18,
      [RewardQuality.Uncommon]: 34,
      [RewardQuality.Rare]: 32,
      [RewardQuality.Legendary]: 16,
    },
    'Transforms existing cards/items instead of adding raw value, with high variance by design.',
  ),
  [RewardPool.Crawlspace]: profile(
    RewardPool.Crawlspace,
    RewardStrength.Rare,
    2,
    1,
    RewardKind.Mixed,
    {
      [RewardQuality.Common]: 22,
      [RewardQuality.Uncommon]: 39,
      [RewardQuality.Rare]: 29,
      [RewardQuality.Legendary]: 10,
    },
    'A scarce detour that sits slightly above Treasure Room value and may contain resources.',
  ),
  [RewardPool.Error]: profile(
    RewardPool.Error,
    RewardStrength.Exceptional,
    3,
    1,
    RewardKind.Item,
    {
      [RewardQuality.Common]: 0,
      [RewardQuality.Uncommon]: 4,
      [RewardQuality.Rare]: 34,
      [RewardQuality.Legendary]: 62,
    },
    'Extremely rare and route-breaking; it intentionally offers near-endgame power.',
  ),
  [RewardPool.LargeRoom]: profile(
    RewardPool.LargeRoom,
    RewardStrength.Steady,
    3,
    1,
    RewardKind.Item,
    {
      [RewardQuality.Common]: 48,
      [RewardQuality.Uncommon]: 39,
      [RewardQuality.Rare]: 12,
      [RewardQuality.Legendary]: 1,
    },
    'An occasional permanent-stat bonus for longer fights, kept modest to avoid snowballing.',
  ),
} satisfies Record<RewardPool, RoomRewardProfile>;

export function rewardQualityWeight(pool: RewardPool, quality: RewardQuality): number {
  return ROOM_REWARD_PROFILES[pool].qualityWeights[quality];
}
