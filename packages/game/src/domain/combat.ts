import type {
  AttackMode,
  BossAttackPattern,
  CombatSelectionKind,
  CombatAnimationKind,
  CombatLogTone,
  CombatMovementStyle,
  CombatRoomShape,
  EnemyBehavior,
  EnemyMovementPattern,
  FamiliarDirection,
  IntentKind,
  RoomKind,
  RoomMissingQuadrant,
  StatusKind,
} from './enums.js';
import type { CardEffect, GridPosition, StatusDurations } from './player.js';

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
  pattern?: BossAttackPattern;
  targetX?: number;
  targetY?: number;
  radius?: number;
  innerRadius?: number;
  range?: number;
}

export interface EnemyState extends EnemyDefinition {
  instanceId: string;
  hp: number;
  shield: number;
  cursedTurns: number;
  staggeredTurns: number;
  poisonTurns: number;
  poisonDamage: number;
  statuses: StatusDurations;
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

/** A passive collectible represented by an autonomous, non-blocking combat assistant. */
export interface FamiliarState {
  instanceId: string;
  itemId: string;
  direction: FamiliarDirection;
  ring: number;
  damage: number;
  hits: number;
  attackMode: AttackMode;
  projectileScale: number;
  splashDamageRatio: number;
  poisonTurns: number;
  poisonDamage: number;
  slowTurns: number;
}

export interface PendingCombatSelection {
  kind: CombatSelectionKind;
  sourceInstanceId: string;
  candidateInstanceIds: string[];
  min: number;
  max: number;
  remainingEffects?: CardEffect[];
  targetId?: string;
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
  /** Effective normal-damage fraction for a non-primary projectile graze. */
  contactDamageScale?: number;
  poisonTurns?: number;
  slowTurns?: number;
  movementStyle?: CombatMovementStyle;
  bossPattern?: BossAttackPattern;
}

export interface CombatLogEntry {
  id: string;
  tone: CombatLogTone;
  message: string;
  messageKey?: string;
  params?: Record<string, string | number>;
}

export interface CombatRoomLayout {
  shape: CombatRoomShape;
  width: number;
  height: number;
  unitCount: 1 | 2 | 3 | 4;
  missingQuadrant?: RoomMissingQuadrant;
}

export interface CombatState {
  roomKind: RoomKind.Combat | RoomKind.Elite | RoomKind.Boss;
  roomLayout: CombatRoomLayout;
  deploymentPending?: boolean;
  round: number;
  vitality: number;
  playerShield: number;
  playerShieldCapacityBuff: number;
  playerArmorBuff: number;
  playerDamageBuff: number;
  playerDamageMultiplier: number;
  playerFireRateBuff: number;
  playerCritChanceBuff: number;
  playerDodgeChanceBuff: number;
  playerRangeBuff: number;
  playerMovementBuff: number;
  attackModeOverride?: AttackMode;
  curvedShotsOverride: boolean;
  damageCap?: number;
  usedPassiveItems: string[];
  itemActionCounters: Record<string, number>;
  usedItemActions: string[];
  observedDefeatIds: string[];
  previousCardDefinitionId?: string;
  statFloorLocked: boolean;
  activeEffectRepeats: number;
  playerStatuses: StatusDurations;
  playerStatusPower: Partial<Record<StatusKind, number>>;
  pendingSelection?: PendingCombatSelection;
  cardDefinitionOverrides: Record<string, string>;
  temporaryCardIds: string[];
  blankBookActive: boolean;
  damoclesActive: boolean;
  damoclesFallen: boolean;
  ragnarokActive: boolean;
  unlimitedVitalityTurns: number;
  playerPosition: GridPosition;
  attackMeter: number;
  hand: string[];
  drawPile: string[];
  discardPile: string[];
  exhausted: string[];
  cooldowns: Record<string, number>;
  familiars: FamiliarState[];
  enemies: EnemyState[];
  selectedEnemyId?: string;
  log: CombatLogEntry[];
  animationSequence: number;
  animationEvents: CombatAnimationEvent[];
  damageTakenThisFloor: number;
}
