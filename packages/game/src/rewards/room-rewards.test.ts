import { describe, expect, it } from 'vitest';
import { CARDS, ITEMS, itemUsesCombatCard } from '../catalog.js';
import { RewardPool, RewardQuality } from '../domain/enums.js';
import { ROOM_REWARD_PROFILES, RewardStrength } from './room-rewards.js';

const designedRoomPools: RewardPool[] = [
  RewardPool.RoomClear,
  RewardPool.Treasure,
  RewardPool.Shop,
  RewardPool.Secret,
  RewardPool.SuperSecret,
  RewardPool.Planetarium,
  RewardPool.Devil,
  RewardPool.Angel,
  RewardPool.Challenge,
  RewardPool.Library,
  RewardPool.Sacrifice,
  RewardPool.Curse,
  RewardPool.Arcade,
  RewardPool.Vault,
  RewardPool.Bedroom,
  RewardPool.Dice,
  RewardPool.Crawlspace,
  RewardPool.Error,
];

function expectedQuality(pool: RewardPool): number {
  const weights = ROOM_REWARD_PROFILES[pool].qualityWeights;
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  return (
    [RewardQuality.Common, RewardQuality.Uncommon, RewardQuality.Rare, RewardQuality.Legendary].reduce(
      (sum, quality) => sum + quality * weights[quality],
      0,
    ) / total
  );
}

describe('room reward balance', () => {
  it('classifies every current card into one or more configured room pools', () => {
    for (const card of Object.values(CARDS)) {
      expect(card.rewardPools.length, card.id).toBeGreaterThan(0);
      expect(card.quality, card.id).toBeGreaterThanOrEqual(RewardQuality.Common);
      expect(card.quality, card.id).toBeLessThanOrEqual(RewardQuality.Legendary);
      for (const pool of card.rewardPools)
        expect(ROOM_REWARD_PROFILES[pool], `${card.id}:${pool}`).toBeDefined();
    }
  });

  it('keeps generated passive-item cards in the same multi-room pools as their items', () => {
    for (const item of Object.values(ITEMS).filter(itemUsesCombatCard)) {
      expect(CARDS[`item:${item.id}`]?.rewardPools).toEqual(item.pool);
      expect(CARDS[`item:${item.id}`]?.quality).toBe(item.quality);
    }
  });

  it('gives every designed room at least one current card or item assignment', () => {
    for (const pool of designedRoomPools) {
      const assignedCards = Object.values(CARDS).filter((card) => card.rewardPools.includes(pool));
      const assignedItems = Object.values(ITEMS).filter((item) => item.pool.includes(pool));
      expect(assignedCards.length + assignedItems.length, pool).toBeGreaterThan(0);
    }
  });

  it('keeps risk and rarity curves ordered', () => {
    expect(ROOM_REWARD_PROFILES[RewardPool.RoomClear].qualityWeights[RewardQuality.Legendary]).toBe(0);
    expect(ROOM_REWARD_PROFILES[RewardPool.Planetarium].qualityWeights[RewardQuality.Common]).toBe(0);
    expect(expectedQuality(RewardPool.Secret)).toBeLessThan(expectedQuality(RewardPool.SuperSecret));
    expect(expectedQuality(RewardPool.Treasure)).toBeLessThan(expectedQuality(RewardPool.Devil));
    expect(expectedQuality(RewardPool.Devil)).toBeLessThan(expectedQuality(RewardPool.Angel));
    expect(expectedQuality(RewardPool.Angel)).toBeLessThan(expectedQuality(RewardPool.Error));
    expect(ROOM_REWARD_PROFILES[RewardPool.Angel].strength).toBe(RewardStrength.Exceptional);
  });

  it('keeps enum wire values compatible with existing saves and translation keys', () => {
    expect(RewardPool.SuperSecret).toBe('super-secret');
    expect(RewardQuality.Legendary).toBe(4);
  });
});
