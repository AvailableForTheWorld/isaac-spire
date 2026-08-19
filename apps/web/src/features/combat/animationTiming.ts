import { CombatAnimationKind, type CombatAnimationEvent } from '@isaac-spire/game';

const COMBAT_ANIMATION_DURATIONS: Readonly<Record<CombatAnimationEvent['kind'], number>> = {
  [CombatAnimationKind.CardPlay]: 460,
  [CombatAnimationKind.CardDiscard]: 440,
  [CombatAnimationKind.DiscardPhase]: 850,
  [CombatAnimationKind.EnemyPhase]: 850,
  [CombatAnimationKind.RoundStart]: 850,
  [CombatAnimationKind.Move]: 520,
  [CombatAnimationKind.PlayerAttack]: 3100,
  [CombatAnimationKind.EnemyAttack]: 3100,
  [CombatAnimationKind.Shield]: 520,
  [CombatAnimationKind.Heal]: 520,
  [CombatAnimationKind.Poison]: 520,
  [CombatAnimationKind.Curse]: 560,
  [CombatAnimationKind.Prepare]: 600,
  [CombatAnimationKind.Summon]: 720,
  [CombatAnimationKind.Idle]: 420,
  [CombatAnimationKind.Defeat]: 650,
  [CombatAnimationKind.BombBlast]: 900,
  [CombatAnimationKind.BombHit]: 3100,
  [CombatAnimationKind.BlackHeart]: 560,
};

export function combatAnimationDuration(events: readonly CombatAnimationEvent[]): number {
  return events.reduce((sum, event) => sum + COMBAT_ANIMATION_DURATIONS[event.kind], 0);
}
