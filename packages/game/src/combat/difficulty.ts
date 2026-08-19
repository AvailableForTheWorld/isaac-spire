export interface FloorDifficulty {
  hpMultiplier: number;
  attackMultiplier: number;
  armorBonus: number;
  movementBonus: number;
  rangeBonus: number;
  encounterMinRatio: number;
  encounterMaxRatio: number;
  bossSupportLimit: number;
}

/**
 * Six readable difficulty beats rather than one hidden linear multiplier.
 * Enemy catalogs still define identity; this curve defines floor pressure.
 */
export const FLOOR_DIFFICULTY_CURVE: readonly FloorDifficulty[] = [
  {
    hpMultiplier: 0.92,
    attackMultiplier: 0.78,
    armorBonus: 0,
    movementBonus: 0,
    rangeBonus: 0,
    encounterMinRatio: 0.5,
    encounterMaxRatio: 0.72,
    bossSupportLimit: 0,
  },
  {
    hpMultiplier: 1,
    attackMultiplier: 0.86,
    armorBonus: 0,
    movementBonus: 0,
    rangeBonus: 0,
    encounterMinRatio: 0.55,
    encounterMaxRatio: 0.82,
    bossSupportLimit: 0,
  },
  {
    hpMultiplier: 1.1,
    attackMultiplier: 0.94,
    armorBonus: 0,
    movementBonus: 0,
    rangeBonus: 0,
    encounterMinRatio: 0.6,
    encounterMaxRatio: 0.9,
    bossSupportLimit: 1,
  },
  {
    hpMultiplier: 1.22,
    attackMultiplier: 1.02,
    armorBonus: 1,
    movementBonus: 0,
    rangeBonus: 0,
    encounterMinRatio: 0.65,
    encounterMaxRatio: 0.95,
    bossSupportLimit: 1,
  },
  {
    hpMultiplier: 1.36,
    attackMultiplier: 1.11,
    armorBonus: 1,
    movementBonus: 1,
    rangeBonus: 1,
    encounterMinRatio: 0.72,
    encounterMaxRatio: 1,
    bossSupportLimit: 2,
  },
  {
    hpMultiplier: 1.52,
    attackMultiplier: 1.2,
    armorBonus: 2,
    movementBonus: 1,
    rangeBonus: 1,
    encounterMinRatio: 0.78,
    encounterMaxRatio: 1,
    bossSupportLimit: 2,
  },
] as const;

export function difficultyForFloor(floorIndex: number): FloorDifficulty {
  return FLOOR_DIFFICULTY_CURVE[
    Math.min(FLOOR_DIFFICULTY_CURVE.length - 1, Math.max(0, Math.floor(floorIndex)))
  ]!;
}
