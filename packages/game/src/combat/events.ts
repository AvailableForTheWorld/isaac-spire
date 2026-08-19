import type { CombatAnimationEvent, CombatLogEntry, CombatState } from '../types.js';
import { CombatLogTone } from '../types.js';

const MAX_LOG_ENTRIES = 8;
const MAX_ANIMATION_EVENTS = 32;

export function pushCombatLog(
  combat: CombatState,
  message: string,
  tone: CombatLogEntry['tone'] = CombatLogTone.Normal,
  messageKey?: string,
  params?: Record<string, string | number>,
): void {
  const idBase = `${combat.round}-${message}`;
  let id = idBase;
  let duplicate = 1;
  while (combat.log.some((entry) => entry.id === id)) id = `${idBase}-${duplicate++}`;
  combat.log.unshift({ id, message, tone, messageKey, params });
  if (combat.log.length > MAX_LOG_ENTRIES) combat.log.length = MAX_LOG_ENTRIES;
}

export function pushCombatAnimation(
  combat: CombatState,
  event: Omit<CombatAnimationEvent, 'sequence'>,
): void {
  combat.animationSequence = (combat.animationSequence ?? 0) + 1;
  combat.animationEvents ??= [];
  combat.animationEvents.push({ ...event, sequence: combat.animationSequence });
  if (combat.animationEvents.length > MAX_ANIMATION_EVENTS) {
    combat.animationEvents.splice(0, combat.animationEvents.length - MAX_ANIMATION_EVENTS);
  }
}
