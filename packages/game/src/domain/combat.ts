import type { AttackMode, GridPosition } from './player.js';

export type IntentKind = 'attack' | 'shield' | 'curse' | 'heal' | 'prepare' | 'summon' | 'idle';
export type EnemyBehavior = 'swarm' | 'hunter' | 'hexer' | 'tank' | 'boss';
export type EnemyMovementPattern = 'cardinal' | 'diagonal-jump';
export type CombatAnimationKind =
  | 'card-play'
  | 'card-discard'
  | 'discard-phase'
  | 'enemy-phase'
  | 'round-start'
  | 'move'
  | 'player-attack'
  | 'enemy-attack'
  | 'shield'
  | 'heal'
  | 'poison'
  | 'curse'
  | 'prepare'
  | 'summon'
  | 'idle'
  | 'defeat'
  | 'bomb-blast'
  | 'bomb-hit'
  | 'black-heart';

export interface EnemyDefinition {
  id: string;
  name: string;
  maxHp: number;
  attack: number;
  armor: number;
  movementSpeed: number;
  attackRange: number;
  visionRange: number;
  footprintWidth: number;
  footprintHeight: number;
  movementPattern: EnemyMovementPattern;
  elite?: boolean;
  boss?: boolean;
  icon: string;
}

export interface EnemyIntent {
  kind: IntentKind;
  value: number;
  label: string;
  actions?: EnemyAction[];
}
export interface EnemyAction {
  kind: IntentKind;
  value: number;
}

export interface EnemyState extends EnemyDefinition {
  instanceId: string;
  hp: number;
  shield: number;
  cursedTurns: number;
  staggeredTurns: number;
  poisonTurns: number;
  poisonDamage: number;
  slowedTurns: number;
  prepared: boolean;
  behavior: EnemyBehavior;
  behaviorStep: number;
  damageTakenThisRound: number;
  reactionCooldown: number;
  turnsSinceAttack: number;
  alerted: boolean;
  position: GridPosition;
  intent: EnemyIntent;
}

export interface CombatAnimationEvent {
  sequence: number;
  kind: CombatAnimationKind;
  sourceId: string;
  targetId?: string;
  value?: number;
  secondaryValue?: number;
  rawValue?: number;
  armorValue?: number;
  hitCount?: number;
  cardId?: string;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  attackMode?: AttackMode;
  projectileScale?: number;
  poisonTurns?: number;
  slowTurns?: number;
  movementStyle?: 'walk' | 'jump' | 'wander';
}

export interface CombatLogEntry {
  id: string;
  tone: 'normal' | 'good' | 'danger' | 'special';
  message: string;
  messageKey?: string;
  params?: Record<string, string | number>;
}

export type CombatRoomShape = 'standard' | 'wide' | 'tall' | 'large' | 'l-shaped';
export type RoomMissingQuadrant = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface CombatRoomLayout {
  shape: CombatRoomShape;
  width: number;
  height: number;
  unitCount: 1 | 2 | 3 | 4;
  missingQuadrant?: RoomMissingQuadrant;
}

export interface CombatState {
  roomKind: 'combat' | 'elite' | 'boss';
  roomLayout: CombatRoomLayout;
  deploymentPending?: boolean;
  round: number;
  vitality: number;
  playerShield: number;
  playerArmorBuff: number;
  playerDamageBuff: number;
  playerDamageMultiplier: number;
  playerFireRateBuff: number;
  playerCritChanceBuff: number;
  playerRangeBuff: number;
  playerMovementBuff: number;
  attackModeOverride?: AttackMode;
  damageCap?: number;
  usedPassiveItems: string[];
  playerPosition: GridPosition;
  attackMeter: number;
  hand: string[];
  drawPile: string[];
  discardPile: string[];
  exhausted: string[];
  cooldowns: Record<string, number>;
  enemies: EnemyState[];
  selectedEnemyId?: string;
  log: CombatLogEntry[];
  animationSequence: number;
  animationEvents: CombatAnimationEvent[];
  damageTakenThisFloor: number;
}
