import type { CombatAnimationEvent } from '@isaac-spire/game';

const COMBAT_ANIMATION_DURATIONS: Readonly<Record<CombatAnimationEvent['kind'], number>> = {
  'card-play': 460,
  'card-discard': 440,
  'discard-phase': 850,
  'enemy-phase': 850,
  'round-start': 850,
  move: 520,
  'player-attack': 3100,
  'enemy-attack': 3100,
  shield: 520,
  heal: 520,
  poison: 520,
  curse: 560,
  prepare: 600,
  summon: 720,
  idle: 420,
  defeat: 650,
  'bomb-blast': 900,
  'bomb-hit': 3100,
  'black-heart': 560,
};

export function combatAnimationDuration(events: readonly CombatAnimationEvent[]): number {
  return events.reduce((sum, event) => sum + COMBAT_ANIMATION_DURATIONS[event.kind], 0);
}
