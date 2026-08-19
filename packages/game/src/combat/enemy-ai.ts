import type {
  EnemyAction,
  EnemyBehavior,
  EnemyDefinition,
  EnemyIntent,
  EnemyState,
  IntentKind,
  RunState,
} from '../types.js';
import { enemyCanAttackPosition, ISAAC_DOOR_POSITION } from './grid.js';

function intentLabel(kind: IntentKind, value: number): string {
  const labels: Record<IntentKind, string> = {
    attack: `Attack ${value}`,
    shield: `Guard ${value}`,
    curse: 'Curse',
    heal: `Recover ${value}`,
    prepare: 'Preparing…',
    summon: `Summon ${value}`,
    idle: 'Staggered',
  };
  return labels[kind];
}

export function behaviorFor(enemy: Pick<EnemyDefinition, 'id' | 'elite' | 'boss'>): EnemyBehavior {
  if (enemy.boss) return 'boss';
  if (enemy.elite || ['globin', 'knight', 'fat-bat', 'champion-knight'].includes(enemy.id)) return 'tank';
  if (['horf', 'vis'].includes(enemy.id)) return 'hexer';
  if (['spider', 'charger', 'leaper'].includes(enemy.id)) return 'hunter';
  return 'swarm';
}

export function enemyAction(kind: IntentKind, value = 0): EnemyAction {
  return { kind, value };
}

export function attackValue(enemy: EnemyState, multiplier = 1): number {
  return Math.max(1, Math.round(enemy.attack * multiplier));
}

function shieldValue(run: RunState, multiplier = 1): number {
  return Math.round((7 + run.floorIndex * 2) * multiplier);
}

function healValue(run: RunState, multiplier = 1): number {
  return Math.round((8 + run.floorIndex * 2) * multiplier);
}

export function makeIntent(actions: EnemyAction[]): EnemyIntent {
  const primary = actions[0] ?? enemyAction('idle');
  return {
    kind: primary.kind,
    value: primary.value,
    label: actions.map((entry) => intentLabel(entry.kind, entry.value)).join(' + '),
    actions,
  };
}

function behaviorPattern(run: RunState, enemy: EnemyState): EnemyAction[][] {
  switch (enemy.behavior) {
    case 'hunter':
      return [
        [enemyAction('prepare')],
        [enemyAction('attack', attackValue(enemy))],
        [enemyAction('attack', attackValue(enemy, 1.2))],
      ];
    case 'hexer':
      return [
        [enemyAction('curse')],
        [enemyAction('attack', attackValue(enemy))],
        [enemyAction('heal', healValue(run))],
        [enemyAction('prepare')],
      ];
    case 'tank':
      return [
        [enemyAction('shield', shieldValue(run, 1.35))],
        [enemyAction('attack', attackValue(enemy))],
        [enemyAction('prepare')],
        [enemyAction('heal', healValue(run))],
      ];
    case 'boss':
      return [[enemyAction('attack', attackValue(enemy)), enemyAction('attack', attackValue(enemy, 0.7))]];
    case 'swarm':
    default:
      return [
        [enemyAction('attack', attackValue(enemy))],
        [enemyAction('prepare')],
        [enemyAction('shield', shieldValue(run, 0.5))],
        [enemyAction('attack', attackValue(enemy, 1.15))],
      ];
  }
}

function reactionIntent(run: RunState, enemy: EnemyState): EnemyIntent {
  switch (enemy.behavior) {
    case 'hunter':
      return makeIntent([enemyAction('prepare')]);
    case 'swarm':
      return makeIntent([enemyAction('shield', shieldValue(run, 0.65))]);
    case 'hexer':
      return makeIntent([enemyAction('heal', healValue(run, 1.2))]);
    case 'boss':
      return makeIntent([enemyAction('heal', healValue(run, 1.35))]);
    case 'tank':
    default:
      return makeIntent([enemyAction('shield', shieldValue(run, 1.25))]);
  }
}

export function ensureEnemyBehavior(enemy: EnemyState): void {
  enemy.intent ??= { kind: 'idle', value: 0, label: 'Watching' };
  enemy.behavior ??= behaviorFor(enemy);
  enemy.behaviorStep ??= 0;
  enemy.damageTakenThisRound ??= 0;
  enemy.reactionCooldown ??= 0;
  enemy.turnsSinceAttack ??= 0;
  enemy.staggeredTurns ??= 0;
  enemy.poisonTurns ??= 0;
  enemy.poisonDamage ??= 0;
  enemy.slowedTurns ??= 0;
  const intendedActions = enemy.intent.actions?.length
    ? enemy.intent.actions
    : [enemyAction(enemy.intent.kind, enemy.intent.value)];
  enemy.intent = makeIntent(intendedActions.slice(0, enemy.boss ? 2 : 1));
}

function rollBossIntent(run: RunState, enemy: EnemyState, canReact: boolean): EnemyIntent {
  const playerPosition = run.combat?.playerPosition ?? ISAAC_DOOR_POSITION;
  const inRange = enemyCanAttackPosition(enemy, playerPosition);
  let patterns: EnemyAction[][];

  if (canReact) {
    enemy.reactionCooldown = 2;
    patterns = inRange
      ? [[enemyAction('attack', attackValue(enemy, 1.1)), enemyAction('heal', healValue(run, 1.35))]]
      : [[enemyAction('heal', healValue(run, 1.35)), enemyAction('shield', shieldValue(run, 1.25))]];
  } else if (inRange && enemy.prepared) {
    patterns = [
      [enemyAction('attack', attackValue(enemy, 2)), enemyAction('attack', attackValue(enemy, 0.7))],
      [enemyAction('attack', attackValue(enemy, 2)), enemyAction('curse')],
      [enemyAction('attack', attackValue(enemy, 2)), enemyAction('summon', 1)],
      [enemyAction('attack', attackValue(enemy, 2)), enemyAction('shield', shieldValue(run))],
    ];
  } else if (inRange) {
    patterns = [
      [enemyAction('attack', attackValue(enemy)), enemyAction('attack', attackValue(enemy, 0.7))],
      [enemyAction('curse'), enemyAction('attack', attackValue(enemy))],
      [enemyAction('summon', 1), enemyAction('attack', attackValue(enemy, 0.9))],
      [enemyAction('prepare'), enemyAction('attack', attackValue(enemy, 2))],
      [enemyAction('attack', attackValue(enemy, 1.15)), enemyAction('shield', shieldValue(run))],
      [enemyAction('attack', attackValue(enemy)), enemyAction('prepare')],
    ];
  } else {
    patterns = [
      [enemyAction('summon', 1), enemyAction('prepare')],
      [enemyAction('curse'), enemyAction('shield', shieldValue(run, 1.25))],
      [enemyAction('heal', healValue(run, 1.15)), enemyAction('summon', 1)],
      [enemyAction('prepare'), enemyAction('shield', shieldValue(run))],
    ];
  }

  const actions = patterns[enemy.behaviorStep % patterns.length] ?? [
    enemyAction('attack', attackValue(enemy)),
    enemyAction('attack', attackValue(enemy, 0.7)),
  ];
  enemy.behaviorStep = (enemy.behaviorStep + 1) % patterns.length;
  return makeIntent(actions);
}

export function rollEnemyIntent(run: RunState, enemy: EnemyState): EnemyIntent {
  ensureEnemyBehavior(enemy);
  const wasCoolingDown = enemy.reactionCooldown > 0;
  enemy.reactionCooldown = Math.max(0, enemy.reactionCooldown - 1);
  const canReact =
    !wasCoolingDown &&
    enemy.damageTakenThisRound >= Math.max(5, Math.round(enemy.maxHp * 0.12)) &&
    enemy.hp < enemy.maxHp;
  enemy.damageTakenThisRound = 0;
  if (enemy.boss) return rollBossIntent(run, enemy, canReact);
  if (enemy.prepared) return makeIntent([enemyAction('attack', attackValue(enemy, 2))]);
  if (enemy.turnsSinceAttack >= 1) return makeIntent([enemyAction('attack', attackValue(enemy, 1.15))]);
  if (canReact) {
    enemy.reactionCooldown = 2;
    return reactionIntent(run, enemy);
  }
  const pattern = behaviorPattern(run, enemy);
  const actions = pattern[enemy.behaviorStep % pattern.length] ?? [enemyAction('attack', attackValue(enemy))];
  enemy.behaviorStep = (enemy.behaviorStep + 1) % pattern.length;
  return makeIntent(actions);
}
