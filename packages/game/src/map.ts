import type { FloorMap, MapNode, RoomKind } from './types.js';

const BRANCH_ROOMS: RoomKind[][] = [
  ['combat', 'treasure', 'elite', 'shop', 'curse', 'combat'],
  ['combat', 'shop', 'combat', 'treasure', 'sacrifice', 'elite'],
  ['combat', 'treasure', 'combat', 'shop', 'planetarium', 'combat'],
];

export function createFloorMap(floorIndex: number): FloorMap {
  const entrance: MapNode = {
    id: `f${floorIndex}-entrance`, kind: 'entrance', lane: 1, depth: 0,
    connections: [], optional: false, visited: true, revealed: true,
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
    id: `f${floorIndex}-boss`, kind: 'boss', lane: 1, depth: 7,
    connections: [], optional: false, visited: false, revealed: true,
  };
  nodes.push(boss);

  entrance.connections = [0, 1, 2].map((lane) => `f${floorIndex}-l${lane}-d1`);
  for (let lane = 0; lane < 3; lane += 1) {
    for (let depth = 1; depth <= 6; depth += 1) {
      const node = nodes.find((entry) => entry.id === `f${floorIndex}-l${lane}-d${depth}`)!;
      if (depth === 6) {
        node.connections = [boss.id];
      } else {
        const nextLanes = [lane - 1, lane, lane + 1].filter((nextLane) => nextLane >= 0 && nextLane <= 2);
        node.connections = nextLanes.map((nextLane) => `f${floorIndex}-l${nextLane}-d${depth + 1}`);
      }
    }
  }

  // Secret rooms are optional detours. They never trap a route when Isaac has no bombs.
  for (let lane = 0; lane < 3; lane += 1) {
    const secretAnchor = `f${floorIndex}-l${lane}-d3`;
    const superAnchor = `f${floorIndex}-l${lane}-d6`;
    nodes.push({
      id: `f${floorIndex}-l${lane}-secret`, kind: 'secret', lane, depth: 3.35,
      connections: [], optional: true, anchorId: secretAnchor, visited: false, revealed: false,
    });
    nodes.push({
      id: `f${floorIndex}-l${lane}-super`, kind: 'super-secret', lane, depth: 5.65,
      connections: [], optional: true, anchorId: superAnchor, visited: false, revealed: false,
    });
  }

  return { floorIndex, nodes, currentNodeId: entrance.id };
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
    .filter((node) => node.optional && node.anchorId === current.id && !node.visited)
    .map((node) => node.id);
  return [...main, ...optional];
}

export function revealFromCurrent(map: FloorMap, revealSecrets: boolean, revealAll: boolean): void {
  const current = getMapNode(map, map.currentNodeId);
  for (const node of map.nodes) {
    if (revealAll && !node.optional) node.revealed = true;
    if (node.optional && (revealSecrets || node.anchorId === current.id)) node.revealed = true;
  }
}
