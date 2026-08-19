export type RoomKind =
  | 'entrance'
  | 'combat'
  | 'elite'
  | 'shop'
  | 'treasure'
  | 'curse'
  | 'sacrifice'
  | 'secret'
  | 'super-secret'
  | 'planetarium'
  | 'boss';

export interface MapNode {
  id: string;
  kind: RoomKind;
  lane: number;
  depth: number;
  connections: string[];
  /** Normalized route-board coordinates. Optional so pre-layout save files remain loadable. */
  mapPosition?: { x: number; y: number };
  optional: boolean;
  anchorId?: string;
  doorOpened?: boolean;
  visited: boolean;
  revealed: boolean;
}

export interface MapConnectionStyle {
  startBend: number;
  endBend: number;
  tension: number;
  dash: number;
  gap: number;
  duration: number;
  delay: number;
  opacity: number;
}

export interface FloorMap {
  floorIndex: number;
  nodes: MapNode[];
  currentNodeId: string;
  /** Per-edge ink treatment, keyed as `sourceId->targetId`. */
  connectionStyles?: Record<string, MapConnectionStyle>;
}
