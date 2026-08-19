import { describe, expect, it } from 'vitest';
import { FLOOR_DIFFICULTY_CURVE, difficultyForFloor } from './difficulty.js';

describe('floor difficulty curve', () => {
  it('increases combat pressure on every descent without an opening-floor spike', () => {
    expect(FLOOR_DIFFICULTY_CURVE).toHaveLength(6);
    for (let index = 1; index < FLOOR_DIFFICULTY_CURVE.length; index += 1) {
      const previous = FLOOR_DIFFICULTY_CURVE[index - 1]!;
      const current = FLOOR_DIFFICULTY_CURVE[index]!;
      expect(current.hpMultiplier).toBeGreaterThan(previous.hpMultiplier);
      expect(current.attackMultiplier).toBeGreaterThan(previous.attackMultiplier);
      expect(current.encounterMinRatio).toBeGreaterThan(previous.encounterMinRatio);
      expect(current.armorBonus).toBeGreaterThanOrEqual(previous.armorBonus);
    }
    expect(difficultyForFloor(-10)).toBe(FLOOR_DIFFICULTY_CURVE[0]);
    expect(difficultyForFloor(99)).toBe(FLOOR_DIFFICULTY_CURVE[5]);
  });
});
