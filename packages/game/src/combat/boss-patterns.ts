import type { EnemyAction, EnemyState, GridPosition, RunState } from '../types.js';
import { BossAttackPattern, IntentKind } from '../types.js';

interface PatternContext {
  run: RunState;
  enemy: EnemyState;
  target: GridPosition;
}

type BossSequence = (context: PatternContext) => EnemyAction[];

interface BossPhaseProfile {
  phase: 1 | 2 | 3;
  sequences: readonly BossSequence[];
}

export interface BossAttackArchetype {
  pattern: BossAttackPattern;
  tacticalRule: string;
  isaacExamples: readonly string[];
}

/**
 * A coverage-oriented taxonomy for adapting the much larger Isaac boss roster.
 * Future bosses should compose these primitives and only add a new resolver when
 * they genuinely introduce a new spatial rule.
 */
export const ISAAC_BOSS_ATTACK_ARCHETYPES: readonly BossAttackArchetype[] = [
  {
    pattern: BossAttackPattern.Contact,
    tacticalRule: 'Hit Isaac when the boss footprint is in its normal attack range.',
    isaacExamples: ['Larry Jr.', 'Chub', 'The Fallen'],
  },
  {
    pattern: BossAttackPattern.ProjectileSpread,
    tacticalRule: 'Telegraph a compact cone around Isaac’s current cell; sidestep before resolution.',
    isaacExamples: ['Monstro', 'Gurdy', 'Mom’s Heart'],
  },
  {
    pattern: BossAttackPattern.RadialBurst,
    tacticalRule: 'Damage a ring around the boss while leaving space outside the radius.',
    isaacExamples: ['Monstro', 'Gurdy Jr.', 'Mega Fatty'],
  },
  {
    pattern: BossAttackPattern.SpiralBarrage,
    tacticalRule: 'Damage an annular band with a safe inner pocket and safe distant cells.',
    isaacExamples: ['Hush', 'Mega Satan', 'Delirium'],
  },
  {
    pattern: BossAttackPattern.LaserLine,
    tacticalRule: 'Lock the target row and column; move off both before the beam fires.',
    isaacExamples: ['Mega Satan', 'Dogma', 'The Beast'],
  },
  {
    pattern: BossAttackPattern.LeapSlam,
    tacticalRule: 'Mark a landing zone, relocate the boss, then damage the marked area.',
    isaacExamples: ['Monstro', 'Mega Fatty', 'The Cage'],
  },
  {
    pattern: BossAttackPattern.GroundStomp,
    tacticalRule: 'Mark a local impact zone without relocating the boss.',
    isaacExamples: ['Mom', 'Ultra Greed', 'Mega Satan'],
  },
  {
    pattern: BossAttackPattern.ChargeLane,
    tacticalRule: 'Lock a horizontal and vertical charge lane through the marked cell.',
    isaacExamples: ['Chub', 'The Cage', 'The Beast'],
  },
  {
    pattern: BossAttackPattern.RockWave,
    tacticalRule: 'Send a cross-shaped shockwave through the marked cell.',
    isaacExamples: ['The Cage', 'Mega Satan', 'Mother'],
  },
  {
    pattern: BossAttackPattern.ProjectileRain,
    tacticalRule: 'Mark a delayed area bombardment around Isaac’s current cell.',
    isaacExamples: ['Mega Fatty', 'Hush', 'Dogma'],
  },
] as const;

const attackValue = (enemy: EnemyState, multiplier: number) =>
  Math.max(1, Math.round(enemy.attack * multiplier));
const targetAttack = (
  context: PatternContext,
  pattern: BossAttackPattern,
  multiplier: number,
  radius = 0,
  extras: Partial<EnemyAction> = {},
): EnemyAction => ({
  kind: IntentKind.Attack,
  value: attackValue(context.enemy, multiplier),
  pattern,
  targetX: context.target.x,
  targetY: context.target.y,
  radius,
  ...extras,
});
const radialAttack = (
  context: PatternContext,
  pattern: BossAttackPattern,
  multiplier: number,
  radius: number,
  innerRadius = 0,
): EnemyAction => ({
  kind: IntentKind.Attack,
  value: attackValue(context.enemy, multiplier),
  pattern,
  radius,
  innerRadius,
});
const summon = (value: number): EnemyAction => ({ kind: IntentKind.Summon, value });
const shield = (run: RunState, multiplier = 1): EnemyAction => ({
  kind: IntentKind.Shield,
  value: Math.round((7 + run.floorIndex * 2) * multiplier),
});
const heal = (run: RunState, multiplier = 1): EnemyAction => ({
  kind: IntentKind.Heal,
  value: Math.round((8 + run.floorIndex * 2) * multiplier),
});

const monstro: readonly BossPhaseProfile[] = [
  {
    phase: 1,
    sequences: [
      (c) => [
        targetAttack(c, BossAttackPattern.ProjectileSpread, 0.7, 1),
        radialAttack(c, BossAttackPattern.RadialBurst, 0.55, 3),
      ],
    ],
  },
  {
    phase: 2,
    sequences: [
      (c) => [
        targetAttack(c, BossAttackPattern.LeapSlam, 1.05, 1),
        radialAttack(c, BossAttackPattern.RadialBurst, 0.65, 3),
      ],
      (c) => [
        targetAttack(c, BossAttackPattern.ProjectileSpread, 0.75, 1),
        targetAttack(c, BossAttackPattern.GroundStomp, 0.8, 0),
      ],
    ],
  },
  {
    phase: 3,
    sequences: [
      (c) => [
        targetAttack(c, BossAttackPattern.LeapSlam, 1.2, 1),
        radialAttack(c, BossAttackPattern.SpiralBarrage, 0.75, 5, 2),
      ],
    ],
  },
];

const duke: readonly BossPhaseProfile[] = [
  {
    phase: 1,
    sequences: [
      (c) => [summon(1), radialAttack(c, BossAttackPattern.RadialBurst, 0.55, 4)],
      (c) => [shield(c.run, 0.8), targetAttack(c, BossAttackPattern.ProjectileSpread, 0.65, 1)],
    ],
  },
  {
    phase: 2,
    sequences: [
      (c) => [summon(2), radialAttack(c, BossAttackPattern.SpiralBarrage, 0.65, 6, 2)],
      (c) => [
        targetAttack(c, BossAttackPattern.ProjectileSpread, 0.8, 1),
        radialAttack(c, BossAttackPattern.RadialBurst, 0.65, 5),
      ],
    ],
  },
  {
    phase: 3,
    sequences: [
      (c) => [
        radialAttack(c, BossAttackPattern.SpiralBarrage, 0.75, 7, 2),
        targetAttack(c, BossAttackPattern.ProjectileRain, 0.7, 1),
      ],
    ],
  },
];

const gurdy: readonly BossPhaseProfile[] = [
  {
    phase: 1,
    sequences: [
      (c) => [targetAttack(c, BossAttackPattern.ProjectileSpread, 0.75, 1), summon(1)],
      (c) => [shield(c.run), targetAttack(c, BossAttackPattern.ProjectileSpread, 0.85, 1)],
    ],
  },
  {
    phase: 2,
    sequences: [
      (c) => [
        targetAttack(c, BossAttackPattern.RockWave, 0.85),
        targetAttack(c, BossAttackPattern.ProjectileSpread, 0.75, 1),
      ],
    ],
  },
  {
    phase: 3,
    sequences: [
      (c) => [
        targetAttack(c, BossAttackPattern.ProjectileRain, 0.85, 1),
        radialAttack(c, BossAttackPattern.SpiralBarrage, 0.75, 7, 2),
      ],
    ],
  },
];

const megaFatty: readonly BossPhaseProfile[] = [
  {
    phase: 1,
    sequences: [
      (c) => [
        targetAttack(c, BossAttackPattern.LeapSlam, 1.05, 1),
        radialAttack(c, BossAttackPattern.RadialBurst, 0.6, 3),
      ],
    ],
  },
  {
    phase: 2,
    sequences: [
      (c) => [
        targetAttack(c, BossAttackPattern.GroundStomp, 1, 1),
        targetAttack(c, BossAttackPattern.ProjectileRain, 0.75, 1),
      ],
      (c) => [summon(1), radialAttack(c, BossAttackPattern.RadialBurst, 0.8, 4)],
    ],
  },
  {
    phase: 3,
    sequences: [
      (c) => [
        targetAttack(c, BossAttackPattern.LeapSlam, 1.25, 1),
        targetAttack(c, BossAttackPattern.ProjectileRain, 0.9, 2),
      ],
    ],
  },
];

const cage: readonly BossPhaseProfile[] = [
  {
    phase: 1,
    sequences: [
      (c) => [
        targetAttack(c, BossAttackPattern.LeapSlam, 1.05, 1),
        targetAttack(c, BossAttackPattern.RockWave, 0.75),
      ],
    ],
  },
  {
    phase: 2,
    sequences: [
      (c) => [
        radialAttack(c, BossAttackPattern.SpiralBarrage, 0.7, 7, 2),
        targetAttack(c, BossAttackPattern.ProjectileSpread, 0.8, 1),
      ],
      (c) => [
        targetAttack(c, BossAttackPattern.ChargeLane, 1.1),
        targetAttack(c, BossAttackPattern.LaserLine, 0.7),
      ],
    ],
  },
  {
    phase: 3,
    sequences: [
      (c) => [
        targetAttack(c, BossAttackPattern.ChargeLane, 1.25),
        radialAttack(c, BossAttackPattern.SpiralBarrage, 0.85, 8, 1),
      ],
    ],
  },
];

const mom: readonly BossPhaseProfile[] = [
  {
    phase: 1,
    sequences: [
      (c) => [
        targetAttack(c, BossAttackPattern.GroundStomp, 1.1, 1),
        targetAttack(c, BossAttackPattern.RockWave, 0.7),
      ],
      (c) => [summon(1), targetAttack(c, BossAttackPattern.LaserLine, 0.75)],
    ],
  },
  {
    phase: 2,
    sequences: [
      (c) => [
        targetAttack(c, BossAttackPattern.ChargeLane, 1.1),
        targetAttack(c, BossAttackPattern.ProjectileRain, 0.8, 1),
      ],
      (c) => [targetAttack(c, BossAttackPattern.GroundStomp, 1.2, 1), summon(2)],
    ],
  },
  {
    phase: 3,
    sequences: [
      (c) => [
        targetAttack(c, BossAttackPattern.GroundStomp, 1.35, 1),
        targetAttack(c, BossAttackPattern.LaserLine, 0.95),
      ],
      (c) => [
        radialAttack(c, BossAttackPattern.SpiralBarrage, 0.9, 9, 2),
        targetAttack(c, BossAttackPattern.ProjectileRain, 0.9, 2),
      ],
    ],
  },
];

const BOSS_PROFILES: Readonly<Record<string, readonly BossPhaseProfile[]>> = {
  monstro,
  duke,
  gurdy,
  fatty: megaFatty,
  cage,
  mom,
};

function currentPhase(enemy: EnemyState): 1 | 2 | 3 {
  const ratio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
  return ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
}

export function bossIntentActions(run: RunState, enemy: EnemyState, canReact: boolean): EnemyAction[] {
  const target = run.combat?.playerPosition ?? { x: 0, y: 4 };
  if (enemy.prepared) {
    return [
      { kind: IntentKind.Attack, value: attackValue(enemy, 2) },
      targetAttack({ run, enemy, target }, BossAttackPattern.ProjectileSpread, 0.7, 1),
    ];
  }
  if (canReact) {
    enemy.reactionCooldown = 2;
    return [
      heal(run, 1.2),
      targetAttack({ run, enemy, target }, BossAttackPattern.ProjectileSpread, 0.75, 1),
    ];
  }
  const profile = BOSS_PROFILES[enemy.id];
  if (!profile) {
    return [
      targetAttack({ run, enemy, target }, BossAttackPattern.ProjectileSpread, 1, 1),
      radialAttack({ run, enemy, target }, BossAttackPattern.RadialBurst, 0.7, 3),
    ];
  }
  const phase = currentPhase(enemy);
  const phaseProfile = profile.find((entry) => entry.phase === phase) ?? profile[0]!;
  const sequence = phaseProfile.sequences[enemy.behaviorStep % phaseProfile.sequences.length]!;
  enemy.behaviorStep = (enemy.behaviorStep + 1) % phaseProfile.sequences.length;
  return sequence({ run, enemy, target });
}
