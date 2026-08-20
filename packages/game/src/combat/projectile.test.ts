import { describe, expect, it } from 'vitest';
import type { EnemyState } from '../types.js';
import {
  BASE_PROJECTILE_DIAMETER_CELLS,
  PROJECTILE_CONTACT_DAMAGE_RATIO,
  getProjectileContacts,
  projectileDiameterInCells,
} from './projectile.js';

function enemy(instanceId: string, x: number, y: number, width = 1, height = 1): EnemyState {
  return {
    instanceId,
    position: { x, y },
    footprintWidth: width,
    footprintHeight: height,
    hp: 100,
  } as EnemyState;
}

describe('projectile contact geometry', () => {
  it('uses a 0.4-cell base diameter and a separately balanced contact-damage ratio', () => {
    expect(projectileDiameterInCells(1)).toBe(BASE_PROJECTILE_DIAMETER_CELLS);
    expect(projectileDiameterInCells(5)).toBe(2);
    expect(PROJECTILE_CONTACT_DAMAGE_RATIO).toBe(0.5);
  });

  it('lets a two-cell projectile graze an adjacent lane that a normal shot misses', () => {
    const target = enemy('target', 5, 4);
    const adjacent = enemy('adjacent', 3, 5);

    expect(getProjectileContacts({ x: 0, y: 4 }, { x: 5, y: 4 }, target, [adjacent], 0.4)).toEqual([]);
    const contacts = getProjectileContacts({ x: 0, y: 4 }, { x: 5, y: 4 }, target, [adjacent], 2);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.enemyId).toBe('adjacent');
    expect(contacts[0]!.areaRatio).toBeGreaterThan(0.4);
    expect(contacts[0]!.areaRatio).toBeLessThan(0.6);
  });

  it('fully contacts a small enemy directly crossed before impact but never reaches behind the target', () => {
    const target = enemy('target', 5, 4);
    const crossed = enemy('crossed', 3, 4);
    const behind = enemy('behind', 6, 4);
    const contacts = getProjectileContacts({ x: 0, y: 4 }, { x: 5, y: 4 }, target, [crossed, behind], 0.4);

    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.enemyId).toBe('crossed');
    expect(contacts[0]!.areaRatio).toBeGreaterThan(0.99);
  });
});
