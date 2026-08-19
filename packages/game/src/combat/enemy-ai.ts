import type { EnemyAction, EnemyDefinition, EnemyIntent, EnemyState, RunState } from '../types.js';
import { BossAttackPattern, EnemyBehavior, IntentKind } from '../types.js';
import { bossIntentActions } from './boss-patterns.js';

function intentLabel(action: EnemyAction): string {
  const labels: Record<IntentKind, string> = {
    [IntentKind.Attack]: `Attack ${action.value}`,
    [IntentKind.Shield]: `Guard ${action.value}`,
    [IntentKind.Curse]: 'Curse',
    [IntentKind.Heal]: `Recover ${action.value}`,
    [IntentKind.Prepare]: 'Preparing…',
    [IntentKind.Summon]: `Summon ${action.value}`,
    [IntentKind.Idle]: 'Staggered',
  };
  if (!action.pattern || action.pattern === BossAttackPattern.Contact) return labels[action.kind];
  const target =
    action.targetX === undefined || action.targetY === undefined
      ? ''
      : ` @ (${action.targetX}, ${action.targetY})`;
  return `${action.pattern} ${action.value}${target}`;
}

export function behaviorFor(enemy: Pick<EnemyDefinition, 'id' | 'elite' | 'boss'>): EnemyBehavior {
  if (enemy.boss) return EnemyBehavior.Boss;
  if (enemy.elite || ['globin', 'knight', 'fat-bat', 'champion-knight'].includes(enemy.id))
    return EnemyBehavior.Tank;
  if (['horf', 'vis'].includes(enemy.id)) return EnemyBehavior.Hexer;
  if (['spider', 'charger', 'leaper'].includes(enemy.id)) return EnemyBehavior.Hunter;
  return EnemyBehavior.Swarm;
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
  const primary = actions[0] ?? enemyAction(IntentKind.Idle);
  return {
    kind: primary.kind,
    value: primary.value,
    label: actions.map(intentLabel).join(' + '),
    actions,
  };
}

function behaviorPattern(run: RunState, enemy: EnemyState): EnemyAction[][] {
  switch (enemy.behavior) {
    case EnemyBehavior.Hunter:
      return [
        [enemyAction(IntentKind.Prepare)],
        [enemyAction(IntentKind.Attack, attackValue(enemy))],
        [enemyAction(IntentKind.Attack, attackValue(enemy, 1.2))],
      ];
    case EnemyBehavior.Hexer:
      return [
        [enemyAction(IntentKind.Curse)],
        [enemyAction(IntentKind.Attack, attackValue(enemy))],
        [enemyAction(IntentKind.Heal, healValue(run))],
        [enemyAction(IntentKind.Prepare)],
      ];
    case EnemyBehavior.Tank:
      return [
        [enemyAction(IntentKind.Shield, shieldValue(run, 1.35))],
        [enemyAction(IntentKind.Attack, attackValue(enemy))],
        [enemyAction(IntentKind.Prepare)],
        [enemyAction(IntentKind.Heal, healValue(run))],
      ];
    case EnemyBehavior.Boss:
      return [
        [
          enemyAction(IntentKind.Attack, attackValue(enemy)),
          enemyAction(IntentKind.Attack, attackValue(enemy, 0.7)),
        ],
      ];
    case EnemyBehavior.Swarm:
    default:
      return [
        [enemyAction(IntentKind.Attack, attackValue(enemy))],
        [enemyAction(IntentKind.Prepare)],
        [enemyAction(IntentKind.Shield, shieldValue(run, 0.5))],
        [enemyAction(IntentKind.Attack, attackValue(enemy, 1.15))],
      ];
  }
}

function reactionIntent(run: RunState, enemy: EnemyState): EnemyIntent {
  switch (enemy.behavior) {
    case EnemyBehavior.Hunter:
      return makeIntent([enemyAction(IntentKind.Prepare)]);
    case EnemyBehavior.Swarm:
      return makeIntent([enemyAction(IntentKind.Shield, shieldValue(run, 0.65))]);
    case EnemyBehavior.Hexer:
      return makeIntent([enemyAction(IntentKind.Heal, healValue(run, 1.2))]);
    case EnemyBehavior.Boss:
      return makeIntent([enemyAction(IntentKind.Heal, healValue(run, 1.35))]);
    case EnemyBehavior.Tank:
    default:
      return makeIntent([enemyAction(IntentKind.Shield, shieldValue(run, 1.25))]);
  }
}

export function ensureEnemyBehavior(enemy: EnemyState): void {
  enemy.intent ??= { kind: IntentKind.Idle, value: 0, label: 'Watching' };
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
  return makeIntent(bossIntentActions(run, enemy, canReact));
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
  if (enemy.prepared) return makeIntent([enemyAction(IntentKind.Attack, attackValue(enemy, 2))]);
  if (enemy.turnsSinceAttack >= 1)
    return makeIntent([enemyAction(IntentKind.Attack, attackValue(enemy, 1.15))]);
  if (canReact) {
    enemy.reactionCooldown = 2;
    return reactionIntent(run, enemy);
  }
  const pattern = behaviorPattern(run, enemy);
  const actions = pattern[enemy.behaviorStep % pattern.length] ?? [
    enemyAction(IntentKind.Attack, attackValue(enemy)),
  ];
  enemy.behaviorStep = (enemy.behaviorStep + 1) % pattern.length;
  return makeIntent(actions);
}
