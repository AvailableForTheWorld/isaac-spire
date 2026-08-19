import { describe, expect, it } from 'vitest';
import { CARDS, ITEMS, RewardQuality } from '@isaac-spire/game';
import { cardAppearanceClass } from './cardAppearance';

describe('card appearance', () => {
  it('maps item cards to their numeric quality surface', () => {
    for (const quality of [
      RewardQuality.Poor,
      RewardQuality.Common,
      RewardQuality.Uncommon,
      RewardQuality.Rare,
      RewardQuality.Legendary,
    ]) {
      const item = Object.values(ITEMS).find((entry) => entry.quality === quality)!;
      expect(cardAppearanceClass(undefined, item)).toBe(`item-card item-quality-${quality}`);
    }
  });

  it('keeps ordinary cards white and gives Tarot cards their own surface', () => {
    expect(cardAppearanceClass(CARDS['basic-attack'])).toBe('standard-card');
    expect(cardAppearanceClass(CARDS['the-empress'])).toBe('tarot-card');
    expect(cardAppearanceClass(CARDS['skill-d6'])).toBe('item-card item-quality-4');
  });
});
