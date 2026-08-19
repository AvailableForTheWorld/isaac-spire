import { describe, expect, it } from 'vitest';
import { BossAttackPattern, CombatAnimationKind, type CombatAnimationEvent } from '@isaac-spire/game';
import { takeNextCombatAnimationBatch } from './combatAnimationQueue';

function event(
  sequence: number,
  kind: CombatAnimationKind,
  sourceId: string,
  targetId = sourceId,
): CombatAnimationEvent {
  return { sequence, kind, sourceId, targetId };
}

describe('combat animation queue', () => {
  it('moves several enemies in one wave while keeping their actions queued', () => {
    const queue = [
      event(1, CombatAnimationKind.Move, 'fly-1'),
      event(2, CombatAnimationKind.Idle, 'fly-1'),
      event(3, CombatAnimationKind.Move, 'fly-2'),
      event(4, CombatAnimationKind.Prepare, 'fly-2'),
      event(5, CombatAnimationKind.Move, 'fly-3'),
      event(6, CombatAnimationKind.EnemyAttack, 'fly-3', 'isaac'),
      event(7, CombatAnimationKind.RoundStart, 'isaac'),
    ];

    expect(takeNextCombatAnimationBatch(queue).map(({ sequence }) => sequence)).toEqual([1, 3, 5]);
    expect(queue.map(({ sequence }) => sequence)).toEqual([2, 4, 6, 7]);
  });

  it('batches independent contiguous statuses without overlapping one actor', () => {
    const queue = [
      event(1, CombatAnimationKind.Prepare, 'spider-1'),
      event(2, CombatAnimationKind.Shield, 'spider-2'),
      event(3, CombatAnimationKind.Heal, 'spider-3', 'spider-2'),
      event(4, CombatAnimationKind.EnemyAttack, 'spider-4', 'isaac'),
    ];

    expect(takeNextCombatAnimationBatch(queue).map(({ sequence }) => sequence)).toEqual([1, 2]);
    expect(queue.map(({ sequence }) => sequence)).toEqual([3, 4]);
  });

  it('keeps boss attacks strictly serial', () => {
    const queue = [
      {
        ...event(1, CombatAnimationKind.EnemyAttack, 'boss', 'isaac'),
        bossPattern: BossAttackPattern.GroundStomp,
      },
      {
        ...event(2, CombatAnimationKind.EnemyAttack, 'boss', 'isaac'),
        bossPattern: BossAttackPattern.ProjectileRain,
      },
    ];

    expect(takeNextCombatAnimationBatch(queue).map(({ sequence }) => sequence)).toEqual([1]);
    expect(queue.map(({ sequence }) => sequence)).toEqual([2]);
  });

  it('plays two adjacent normal attacks as a readable salvo', () => {
    const queue = [
      event(1, CombatAnimationKind.EnemyAttack, 'fly-1', 'isaac'),
      event(2, CombatAnimationKind.EnemyAttack, 'fly-2', 'isaac'),
      event(3, CombatAnimationKind.EnemyAttack, 'fly-3', 'isaac'),
    ];

    expect(takeNextCombatAnimationBatch(queue).map(({ sequence }) => sequence)).toEqual([1, 2]);
    expect(queue.map(({ sequence }) => sequence)).toEqual([3]);
  });
});
