import type { EnemyState, GridPosition } from '../types.js';
import { enemyFootprint } from './grid.js';

/** Isaac's unmodified tear occupies 0.4 of one combat-grid cell by diameter. */
export const BASE_PROJECTILE_DIAMETER_CELLS = 0.4;

/** A complete graze deals half of the attack's normal raw damage before armor. */
export const PROJECTILE_CONTACT_DAMAGE_RATIO = 0.5;

const AREA_INTEGRATION_SLICES = 96;
const PATH_SAMPLE_COUNT = 64;
const MINIMUM_CONTACT_AREA_RATIO = 0.005;

interface ContinuousPoint {
  x: number;
  y: number;
}

interface GridRectangle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ProjectileContact {
  enemyId: string;
  /** Fraction of the smaller of the projectile and enemy hitbox that overlaps, from 0 to 1. */
  areaRatio: number;
  /** Position along the flight path, used to preserve contact order. */
  pathProgress: number;
}

export function projectileDiameterInCells(projectileScale: number): number {
  return BASE_PROJECTILE_DIAMETER_CELLS * Math.max(0.1, projectileScale);
}

function cellCenter(position: GridPosition): ContinuousPoint {
  return { x: position.x + 0.5, y: position.y + 0.5 };
}

function enemyRectangle(enemy: EnemyState): GridRectangle {
  const footprint = enemyFootprint(enemy);
  return {
    left: enemy.position.x,
    top: enemy.position.y,
    right: enemy.position.x + footprint.width,
    bottom: enemy.position.y + footprint.height,
  };
}

function pointAt(start: ContinuousPoint, end: ContinuousPoint, progress: number): ContinuousPoint {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };
}

function pointToRectangleDistance(point: ContinuousPoint, rectangle: GridRectangle): number {
  const dx = Math.max(rectangle.left - point.x, 0, point.x - rectangle.right);
  const dy = Math.max(rectangle.top - point.y, 0, point.y - rectangle.bottom);
  return Math.hypot(dx, dy);
}

/**
 * Finds the projectile center at the first physical contact with the selected target.
 * The tear bursts there, so enemies beyond this point cannot be grazed.
 */
function impactCenter(
  start: ContinuousPoint,
  aimedCell: ContinuousPoint,
  target: GridRectangle,
  radius: number,
): ContinuousPoint {
  if (pointToRectangleDistance(start, target) <= radius) return start;
  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (pointToRectangleDistance(pointAt(start, aimedCell, middle), target) <= radius) upper = middle;
    else lower = middle;
  }
  return pointAt(start, aimedCell, upper);
}

/** Numerically integrates the exact vertical circle/rectangle overlap at deterministic slices. */
function circleRectangleOverlapArea(
  center: ContinuousPoint,
  radius: number,
  rectangle: GridRectangle,
): number {
  const left = Math.max(rectangle.left, center.x - radius);
  const right = Math.min(rectangle.right, center.x + radius);
  if (right <= left) return 0;
  const sliceWidth = (right - left) / AREA_INTEGRATION_SLICES;
  let area = 0;
  for (let index = 0; index < AREA_INTEGRATION_SLICES; index += 1) {
    const x = left + (index + 0.5) * sliceWidth;
    const halfHeight = Math.sqrt(Math.max(0, radius ** 2 - (x - center.x) ** 2));
    const overlapTop = Math.max(rectangle.top, center.y - halfHeight);
    const overlapBottom = Math.min(rectangle.bottom, center.y + halfHeight);
    area += Math.max(0, overlapBottom - overlapTop) * sliceWidth;
  }
  return area;
}

function maximumContact(
  start: ContinuousPoint,
  end: ContinuousPoint,
  radius: number,
  rectangle: GridRectangle,
): { area: number; progress: number } {
  let maximumArea = 0;
  let maximumProgress = 0;
  for (let index = 0; index <= PATH_SAMPLE_COUNT; index += 1) {
    const progress = index / PATH_SAMPLE_COUNT;
    const center = pointAt(start, end, progress);
    if (pointToRectangleDistance(center, rectangle) >= radius) continue;
    const area = circleRectangleOverlapArea(center, radius, rectangle);
    if (area > maximumArea) {
      maximumArea = area;
      maximumProgress = progress;
    }
  }
  return { area: maximumArea, progress: maximumProgress };
}

/**
 * Returns non-primary enemies touched by the projectile before it bursts on the selected target.
 * Contacts are ordered along the flight path and carry an overlap-area ratio for damage scaling.
 */
export function getProjectileContacts(
  origin: GridPosition,
  aimedCell: GridPosition,
  target: EnemyState,
  otherEnemies: readonly EnemyState[],
  projectileDiameter: number,
): ProjectileContact[] {
  const radius = Math.max(0.01, projectileDiameter / 2);
  const start = cellCenter(origin);
  const aimedCenter = cellCenter(aimedCell);
  const end = impactCenter(start, aimedCenter, enemyRectangle(target), radius);
  const projectileArea = Math.PI * radius ** 2;

  return otherEnemies
    .filter((enemy) => enemy.hp > 0 && enemy.instanceId !== target.instanceId)
    .map((enemy): ProjectileContact | undefined => {
      const rectangle = enemyRectangle(enemy);
      const contact = maximumContact(start, end, radius, rectangle);
      const footprintArea = (rectangle.right - rectangle.left) * (rectangle.bottom - rectangle.top);
      const areaRatio = contact.area / Math.min(projectileArea, footprintArea);
      if (areaRatio < MINIMUM_CONTACT_AREA_RATIO) return undefined;
      return {
        enemyId: enemy.instanceId,
        areaRatio: Math.min(1, areaRatio),
        pathProgress: contact.progress,
      };
    })
    .filter((contact): contact is ProjectileContact => Boolean(contact))
    .sort((left, right) => left.pathProgress - right.pathProgress);
}
