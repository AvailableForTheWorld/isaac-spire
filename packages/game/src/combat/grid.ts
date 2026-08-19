import type { CombatRoomLayout, CombatState, EnemyDefinition, EnemyState, GridPosition } from '../types.js';

export const STANDARD_ROOM_WIDTH = 17;
export const STANDARD_ROOM_HEIGHT = 9;
export const COMBAT_GRID_WIDTH = STANDARD_ROOM_WIDTH;
export const COMBAT_GRID_HEIGHT = STANDARD_ROOM_HEIGHT;
export const ISAAC_DOOR_POSITION: GridPosition = { x: 0, y: 4 };

export const DEFAULT_COMBAT_ROOM_LAYOUT: CombatRoomLayout = {
  shape: 'standard',
  width: STANDARD_ROOM_WIDTH,
  height: STANDARD_ROOM_HEIGHT,
  unitCount: 1,
};

export function gridDistance(left: GridPosition, right: GridPosition): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

export function isStraightLineInRange(origin: GridPosition, target: GridPosition, range: number): boolean {
  const xDistance = Math.abs(origin.x - target.x);
  const yDistance = Math.abs(origin.y - target.y);
  return (xDistance === 0 || yDistance === 0) && xDistance + yDistance <= range;
}

function roomLayout(combat?: Pick<CombatState, 'roomLayout'>): CombatRoomLayout {
  return combat?.roomLayout ?? DEFAULT_COMBAT_ROOM_LAYOUT;
}

export function isCombatCellAvailable(
  combat: Pick<CombatState, 'roomLayout'>,
  position: GridPosition,
): boolean {
  const layout = roomLayout(combat);
  if (position.x < 0 || position.x >= layout.width || position.y < 0 || position.y >= layout.height)
    return false;
  if (layout.shape !== 'l-shaped' || !layout.missingQuadrant) return true;
  const right = position.x >= STANDARD_ROOM_WIDTH;
  const bottom = position.y >= STANDARD_ROOM_HEIGHT;
  const quadrant = `${bottom ? 'bottom' : 'top'}-${right ? 'right' : 'left'}`;
  return quadrant !== layout.missingQuadrant;
}

export function getCombatRoomCells(combat: Pick<CombatState, 'roomLayout'>): GridPosition[] {
  const layout = roomLayout(combat);
  return Array.from({ length: layout.width * layout.height }, (_, index) => ({
    x: index % layout.width,
    y: Math.floor(index / layout.width),
  })).filter((position) => isCombatCellAvailable(combat, position));
}

export function positionKey(position: GridPosition): string {
  return `${position.x}:${position.y}`;
}

export function enemyFootprint(enemy: Pick<EnemyDefinition, 'footprintWidth' | 'footprintHeight'>): {
  width: number;
  height: number;
} {
  const maxWidth = STANDARD_ROOM_WIDTH * 2;
  const maxHeight = STANDARD_ROOM_HEIGHT * 2;
  return {
    width: Math.max(1, Math.min(maxWidth, Math.round(enemy.footprintWidth ?? 1))),
    height: Math.max(1, Math.min(maxHeight, Math.round(enemy.footprintHeight ?? 1))),
  };
}

export function footprintCellsAt(
  enemy: Pick<EnemyDefinition, 'footprintWidth' | 'footprintHeight'>,
  position: GridPosition,
): GridPosition[] {
  const { width, height } = enemyFootprint(enemy);
  return Array.from({ length: width * height }, (_, index) => ({
    x: position.x + (index % width),
    y: position.y + Math.floor(index / width),
  }));
}

export function getEnemyOccupiedCells(enemy: EnemyState, position = enemy.position): GridPosition[] {
  return footprintCellsAt(enemy, position);
}

export function enemyPositionFits(
  combat: CombatState,
  enemy: EnemyState,
  position: GridPosition,
  blocked = new Set<string>(),
): boolean {
  return footprintCellsAt(enemy, position).every(
    (cell) => isCombatCellAvailable(combat, cell) && !blocked.has(positionKey(cell)),
  );
}

export function fallbackEnemyPosition(combat: CombatState, index: number, enemy: EnemyState): GridPosition {
  const candidates = getCombatRoomCells(combat).filter((position) =>
    enemyPositionFits(combat, enemy, position),
  );
  return candidates[index % Math.max(1, candidates.length)] ?? { ...ISAAC_DOOR_POSITION };
}

export function findAvailableEnemyPosition(
  combat: CombatState,
  enemy: EnemyState,
  preferred: GridPosition,
  blocked: Set<string>,
): GridPosition {
  const candidates = getCombatRoomCells(combat)
    .filter((candidate) => enemyPositionFits(combat, enemy, candidate, blocked))
    .sort((left, right) => gridDistance(left, preferred) - gridDistance(right, preferred));
  return candidates[0] ?? fallbackEnemyPosition(combat, 0, enemy);
}

/** Breadth-first search guarantees the shortest cardinal route to every returned cell. */
export function reachablePositions(
  combat: CombatState,
  start: GridPosition,
  maxSteps: number,
  blocked: Set<string>,
): GridPosition[] {
  const queue: Array<{ position: GridPosition; steps: number }> = [{ position: start, steps: 0 }];
  let cursor = 0;
  const visited = new Set<string>([positionKey(start)]);
  const reachable: GridPosition[] = [];
  while (cursor < queue.length) {
    const current = queue[cursor++]!;
    if (current.steps > 0) reachable.push(current.position);
    if (current.steps >= maxSteps) continue;
    const neighbors = [
      { x: current.position.x + 1, y: current.position.y },
      { x: current.position.x - 1, y: current.position.y },
      { x: current.position.x, y: current.position.y + 1 },
      { x: current.position.x, y: current.position.y - 1 },
    ];
    for (const position of neighbors) {
      const key = positionKey(position);
      if (!isCombatCellAvailable(combat, position) || blocked.has(key) || visited.has(key)) continue;
      visited.add(key);
      queue.push({ position, steps: current.steps + 1 });
    }
  }
  return reachable;
}

export function enemyDistanceToPosition(
  enemy: EnemyState,
  position: GridPosition,
  anchor = enemy.position,
): number {
  return Math.min(...footprintCellsAt(enemy, anchor).map((cell) => gridDistance(cell, position)));
}

export function enemyChebyshevDistanceToPosition(
  enemy: EnemyState,
  position: GridPosition,
  anchor = enemy.position,
): number {
  return Math.min(
    ...footprintCellsAt(enemy, anchor).map((cell) =>
      Math.max(Math.abs(cell.x - position.x), Math.abs(cell.y - position.y)),
    ),
  );
}

export function enemyCanAttackPosition(
  enemy: EnemyState,
  position: GridPosition,
  anchor = enemy.position,
): boolean {
  if (enemy.movementPattern === 'diagonal-jump') {
    return enemyChebyshevDistanceToPosition(enemy, position, anchor) <= enemy.attackRange;
  }
  return footprintCellsAt(enemy, anchor).some((cell) =>
    isStraightLineInRange(cell, position, enemy.attackRange),
  );
}

export function enemyCanSeePosition(enemy: EnemyState, position: GridPosition): boolean {
  return enemyChebyshevDistanceToPosition(enemy, position) <= enemy.visionRange;
}

export function getEnemyMovementSpeed(enemy: EnemyState): number {
  const movementSpeed = enemy.movementSpeed ?? (enemy.boss ? 2 : 3);
  return enemy.slowedTurns > 0 ? Math.max(1, Math.ceil(movementSpeed / 2)) : movementSpeed;
}
