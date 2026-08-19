import { CombatAnimationKind, type CombatAnimationEvent } from '@isaac-spire/game';

const MAX_PARALLEL_ANIMATIONS = 4;
const MAX_PARALLEL_ATTACKS = 2;

const PARALLEL_STATUS_KINDS = new Set<CombatAnimationKind>([
  CombatAnimationKind.Shield,
  CombatAnimationKind.Heal,
  CombatAnimationKind.Poison,
  CombatAnimationKind.Curse,
  CombatAnimationKind.Prepare,
  CombatAnimationKind.Summon,
  CombatAnimationKind.Idle,
  CombatAnimationKind.Defeat,
]);

function isEnemyMovement(event: CombatAnimationEvent): boolean {
  return event.kind === CombatAnimationKind.Move && event.sourceId !== 'isaac';
}

function isParallelEnemyStatus(event: CombatAnimationEvent): boolean {
  return event.sourceId !== 'isaac' && PARALLEL_STATUS_KINDS.has(event.kind);
}

function isParallelEnemyAttack(event: CombatAnimationEvent): boolean {
  return (
    event.kind === CombatAnimationKind.EnemyAttack &&
    event.sourceId !== 'isaac' &&
    event.bossPattern === undefined
  );
}

function eventActors(event: CombatAnimationEvent): string[] {
  return [...new Set([event.sourceId, event.targetId].filter((actor): actor is string => Boolean(actor)))];
}

function conflictsWithBatch(event: CombatAnimationEvent, occupiedActors: ReadonlySet<string>): boolean {
  return eventActors(event).some((actor) => occupiedActors.has(actor));
}

/**
 * Removes the next visual batch from the queue. Enemy movement may pass later
 * non-movement events so a large room moves as a wave. Status animations only
 * batch while contiguous, preserving move-before-action and attack readability.
 */
export function takeNextCombatAnimationBatch(queue: CombatAnimationEvent[]): CombatAnimationEvent[] {
  const first = queue.shift();
  if (!first) return [];

  const movementBatch = isEnemyMovement(first);
  const statusBatch = isParallelEnemyStatus(first);
  const attackBatch = isParallelEnemyAttack(first);
  if (!movementBatch && !statusBatch && !attackBatch) return [first];

  const batch = [first];
  const occupiedActors = new Set(eventActors(first));
  const batchLimit = attackBatch ? MAX_PARALLEL_ATTACKS : MAX_PARALLEL_ANIMATIONS;
  for (let index = 0; index < queue.length && batch.length < batchLimit;) {
    const candidate = queue[index]!;
    if (candidate.kind === CombatAnimationKind.RoundStart) break;

    const compatible = movementBatch
      ? isEnemyMovement(candidate)
      : statusBatch
        ? isParallelEnemyStatus(candidate)
        : isParallelEnemyAttack(candidate);
    if (!compatible) {
      if (statusBatch || attackBatch) break;
      index += 1;
      continue;
    }
    if (!attackBatch && conflictsWithBatch(candidate, occupiedActors)) {
      index += 1;
      continue;
    }

    batch.push(candidate);
    eventActors(candidate).forEach((actor) => occupiedActors.add(actor));
    queue.splice(index, 1);
  }
  return batch;
}
