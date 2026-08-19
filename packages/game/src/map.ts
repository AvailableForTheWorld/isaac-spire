import { hashSeed, nextRandom, randomInt, shuffle } from './random.js';
import type { FloorMap, MapConnectionStyle, MapNode, RoomKind } from './types.js';

const BRANCH_ROOMS: RoomKind[][] = [
  ['combat', 'treasure', 'elite', 'shop', 'curse', 'combat'],
  ['combat', 'shop', 'combat', 'treasure', 'sacrifice', 'elite'],
  ['combat', 'treasure', 'combat', 'shop', 'planetarium', 'combat'],
];

const ROUTE_PATTERNS = [
  [0, 1, 2],
  [1, 0, 2],
  [0, 2, 1],
  [1, 2, 0],
  [2, 0, 1],
] as const;

type RouteRandom = { rngState: number };

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function presentationRandom(routeSeed: string, key: string): RouteRandom {
  return { rngState: hashSeed(`${routeSeed}:${key}`) };
}

function randomBetween(state: RouteRandom, min: number, max: number): number {
  return min + nextRandom(state) * (max - min);
}

function randomPatternIndex(state: RouteRandom): number {
  const roll = nextRandom(state);
  if (roll < 0.42) return 0;
  if (roll < 0.64) return 1;
  if (roll < 0.86) return 2;
  if (roll < 0.93) return 3;
  return 4;
}

function mainNodePosition(routeSeed: string, node: MapNode): { x: number; y: number } {
  const state = presentationRandom(routeSeed, `node:${node.id}`);
  if (node.kind === 'entrance') {
    return { x: rounded(randomBetween(state, 46, 54)), y: rounded(randomBetween(state, 4.8, 6.4)) };
  }
  if (node.kind === 'boss') {
    return { x: rounded(randomBetween(state, 43, 57)), y: rounded(randomBetween(state, 87.8, 89.4)) };
  }
  const laneCenter = [19, 50, 81][node.lane] ?? 50;
  return {
    x: rounded(laneCenter + randomBetween(state, -5.8, 5.8)),
    y: rounded(5.1 + node.depth * 11.85 + randomBetween(state, -1.5, 1.5)),
  };
}

function optionalNodePosition(routeSeed: string, node: MapNode, anchor: MapNode): { x: number; y: number } {
  const state = presentationRandom(routeSeed, `optional:${node.id}`);
  const randomDirection = nextRandom(state) < 0.5 ? -1 : 1;
  const direction = node.lane === 0 ? -1 : node.lane === 2 ? 1 : randomDirection;
  const distance = randomBetween(state, 8.5, 11.5);
  const anchorPosition = anchor.mapPosition ?? mainNodePosition(routeSeed, anchor);
  return {
    x: rounded(Math.max(5.5, Math.min(94.5, anchorPosition.x + direction * distance))),
    y: rounded(Math.max(8, Math.min(89, anchorPosition.y + randomBetween(state, -3.5, 3.5)))),
  };
}

function connectionStyle(routeSeed: string, sourceId: string, targetId: string): MapConnectionStyle {
  const state = presentationRandom(routeSeed, `edge:${sourceId}->${targetId}`);
  return {
    startBend: rounded(randomBetween(state, -7.5, 7.5)),
    endBend: rounded(randomBetween(state, -7.5, 7.5)),
    tension: rounded(randomBetween(state, 0.24, 0.43)),
    dash: rounded(randomBetween(state, 1.4, 3.8)),
    gap: rounded(randomBetween(state, 1.7, 4.5)),
    duration: rounded(randomBetween(state, 12, 22)),
    delay: rounded(randomBetween(state, -10, 0)),
    opacity: rounded(randomBetween(state, 0.72, 1)),
  };
}

export function mapConnectionKey(sourceId: string, targetId: string): string {
  return `${sourceId}->${targetId}`;
}

export function createFloorMap(floorIndex: number, runSeed = 'ISAAC'): FloorMap {
  const routeSeed = `${runSeed}:floor:${floorIndex}`;
  const topologyRandom: RouteRandom = { rngState: hashSeed(`${routeSeed}:topology`) };
  const entrance: MapNode = {
    id: `f${floorIndex}-entrance`,
    kind: 'entrance',
    lane: 1,
    depth: 0,
    connections: [],
    optional: false,
    visited: true,
    revealed: true,
  };
  const nodes: MapNode[] = [entrance];

  for (let lane = 0; lane < BRANCH_ROOMS.length; lane += 1) {
    for (let depth = 1; depth <= 6; depth += 1) {
      nodes.push({
        id: `f${floorIndex}-l${lane}-d${depth}`,
        kind: BRANCH_ROOMS[lane]![depth - 1]!,
        lane,
        depth,
        connections: [],
        optional: false,
        visited: false,
        revealed: true,
      });
    }
  }

  const boss: MapNode = {
    id: `f${floorIndex}-boss`,
    kind: 'boss',
    lane: 1,
    depth: 7,
    connections: [],
    optional: false,
    visited: false,
    revealed: true,
  };
  nodes.push(boss);

  entrance.connections = shuffle(topologyRandom, [0, 1, 2]).map((lane) => `f${floorIndex}-l${lane}-d1`);

  const patternIndexes = Array.from({ length: 5 }, () => randomPatternIndex(topologyRandom));
  if (!patternIndexes.includes(0))
    patternIndexes[randomInt(topologyRandom, 0, patternIndexes.length - 1)] = 0;
  const nonCalmPatternCount = patternIndexes.reduce<number>(
    (count, index) => count + (index === 0 ? 0 : 1),
    0,
  );
  if (nonCalmPatternCount === 0) {
    patternIndexes[randomInt(topologyRandom, 0, patternIndexes.length - 1)] = randomInt(topologyRandom, 1, 2);
  }
  const branchCounts = patternIndexes.map(() => {
    const roll = nextRandom(topologyRandom);
    return roll < 0.42 ? 0 : roll < 0.9 ? 1 : 2;
  });
  // Always leave one visually calm layer and at least one genuine branch elsewhere.
  const calmLayer = patternIndexes.indexOf(0);
  branchCounts[calmLayer] = 0;
  const totalExtraBranches = branchCounts.reduce<number>((total, count) => total + count, 0);
  if (totalExtraBranches === 0) {
    branchCounts[calmLayer === 0 ? 1 : 0] = 1;
  }

  for (let depth = 1; depth <= 5; depth += 1) {
    const pattern = ROUTE_PATTERNS[patternIndexes[depth - 1]!]!;
    const primaryTargets = new Set<string>();
    for (let lane = 0; lane < 3; lane += 1) {
      const source = nodes.find((entry) => entry.id === `f${floorIndex}-l${lane}-d${depth}`)!;
      const targetLane = pattern[lane]!;
      const targetId = `f${floorIndex}-l${targetLane}-d${depth + 1}`;
      source.connections = [targetId];
      primaryTargets.add(`${lane}:${targetLane}`);
    }

    const nearbyCandidates: { sourceLane: number; targetLane: number }[] = [];
    const longCandidates: { sourceLane: number; targetLane: number }[] = [];
    for (let sourceLane = 0; sourceLane < 3; sourceLane += 1) {
      for (let targetLane = 0; targetLane < 3; targetLane += 1) {
        if (primaryTargets.has(`${sourceLane}:${targetLane}`)) continue;
        const candidate = { sourceLane, targetLane };
        (Math.abs(sourceLane - targetLane) <= 1 ? nearbyCandidates : longCandidates).push(candidate);
      }
    }
    const candidates = [
      ...shuffle(topologyRandom, nearbyCandidates),
      ...shuffle(topologyRandom, longCandidates),
    ];
    for (const candidate of candidates.slice(0, branchCounts[depth - 1])) {
      const source = nodes.find((entry) => entry.id === `f${floorIndex}-l${candidate.sourceLane}-d${depth}`)!;
      source.connections.push(`f${floorIndex}-l${candidate.targetLane}-d${depth + 1}`);
    }
  }
  for (let lane = 0; lane < 3; lane += 1) {
    nodes.find((entry) => entry.id === `f${floorIndex}-l${lane}-d6`)!.connections = [boss.id];
  }

  // Secret rooms are optional detours. They never trap a route when Isaac has no bombs.
  for (let lane = 0; lane < 3; lane += 1) {
    const secretAnchor = `f${floorIndex}-l${lane}-d3`;
    const superAnchor = `f${floorIndex}-l${lane}-d6`;
    nodes.push({
      id: `f${floorIndex}-l${lane}-secret`,
      kind: 'secret',
      lane,
      depth: 3.35,
      connections: [],
      optional: true,
      anchorId: secretAnchor,
      doorOpened: false,
      visited: false,
      revealed: false,
    });
    nodes.push({
      id: `f${floorIndex}-l${lane}-super`,
      kind: 'super-secret',
      lane,
      depth: 5.65,
      connections: [],
      optional: true,
      anchorId: superAnchor,
      doorOpened: false,
      visited: false,
      revealed: false,
    });
  }

  for (const node of nodes.filter((entry) => !entry.optional)) {
    node.mapPosition = mainNodePosition(routeSeed, node);
  }
  for (const node of nodes.filter((entry) => entry.optional)) {
    const anchor = nodes.find((entry) => entry.id === node.anchorId)!;
    node.mapPosition = optionalNodePosition(routeSeed, node, anchor);
  }

  const connectionStyles: Record<string, MapConnectionStyle> = {};
  for (const node of nodes) {
    const targets = node.optional && node.anchorId ? [node.anchorId] : node.connections;
    for (const targetId of targets) {
      const sourceId = node.optional && node.anchorId ? node.anchorId : node.id;
      const actualTargetId = node.optional ? node.id : targetId;
      connectionStyles[mapConnectionKey(sourceId, actualTargetId)] = connectionStyle(
        routeSeed,
        sourceId,
        actualTargetId,
      );
    }
  }

  return { floorIndex, nodes, currentNodeId: entrance.id, connectionStyles };
}

export function getMapNode(map: FloorMap, id: string): MapNode {
  const node = map.nodes.find((entry) => entry.id === id);
  if (!node) throw new Error(`Unknown map node: ${id}`);
  return node;
}

export function availableNodeIds(map: FloorMap): string[] {
  const current = getMapNode(map, map.currentNodeId);
  const main = current.connections;
  const optional = map.nodes
    .filter((node) => node.optional && node.anchorId === current.id && node.doorOpened && !node.visited)
    .map((node) => node.id);
  return [...main, ...optional];
}

export function revealFromCurrent(map: FloorMap, revealSecrets: boolean, revealAll: boolean): void {
  for (const node of map.nodes) {
    if (revealAll && !node.optional) node.revealed = true;
    if (node.optional && revealSecrets) node.revealed = true;
  }
}
