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

export type RunPhase =
  | 'map'
  | 'combat'
  | 'discard'
  | 'choice'
  | 'victory'
  | 'defeat';

export type CardType = 'attack' | 'skill' | 'item' | 'recovery' | 'shield' | 'hex' | 'tarot' | 'curse';
export type AttackMode = 'tears' | 'knife' | 'brimstone' | 'tech-x';
export type HeartKind = 'soul' | 'black';
export type IntentKind = 'attack' | 'shield' | 'curse' | 'heal' | 'prepare' | 'idle';
export type EnemyBehavior = 'swarm' | 'hunter' | 'hexer' | 'tank' | 'boss';
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
  | 'curse'
  | 'prepare'
  | 'idle'
  | 'defeat'
  | 'black-heart';
export type ItemKind = 'active' | 'passive';
export type ChoiceKind = 'loot' | 'item' | 'shop' | 'deal' | 'upgrade' | 'sacrifice' | 'card';

export interface CharacterStats {
  baseDamage: number;
  damageMultiplier: number;
  armor: number;
  baseShield: number;
  heartSize: number;
  maxVitality: number;
  drawCount: number;
  maxRetain: number;
  fireRate: number;
  luck: number;
  critChance: number;
  dodgeChance: number;
  shopDiscount: number;
  movementSpeed: number;
  attackRange: number;
  attackMode: AttackMode;
}

export interface GridPosition {
  x: number;
  y: number;
}

export interface PocketHeart {
  id: string;
  kind: HeartKind;
  hp: number;
  maxHp: number;
}

export interface PlayerState {
  character: 'isaac';
  redContainers: number;
  redHp: number;
  pocketHearts: PocketHeart[];
  stats: CharacterStats;
  coins: number;
  bombs: number;
  keys: number;
  items: string[];
  activeItemId?: string;
  deck: CardInstance[];
}

export interface CardDefinition {
  id: string;
  name: string;
  type: CardType;
  cost: number;
  description: string;
  value?: number;
  hits?: number;
  target: 'enemy' | 'all-enemies' | 'self' | 'none';
  exhaust?: boolean;
  itemId?: string;
  icon: string;
}

export interface CardInstance {
  instanceId: string;
  definitionId: string;
  upgraded: boolean;
}

export interface ItemEffect {
  stat?: keyof Omit<CharacterStats, 'attackMode'>;
  amount?: number;
  multiplier?: number;
  attackMode?: AttackMode;
  redContainers?: number;
  soulHearts?: number;
  blackHearts?: number;
  revealSecrets?: boolean;
  revealAll?: boolean;
  guaranteeDeal?: boolean;
  damageCap?: number;
  curvedShots?: boolean;
}

export interface ItemDefinition {
  id: string;
  name: string;
  kind: ItemKind;
  pool: Array<'treasure' | 'shop' | 'boss' | 'devil' | 'angel' | 'planetarium' | 'secret' | 'elite' | 'curse'>;
  description: string;
  icon: string;
  quality: 1 | 2 | 3 | 4;
  chargeRounds?: number;
  skillCardId?: string;
  effects?: ItemEffect[];
  unlock?: { event: string; label: string };
}

export interface FloorDefinition {
  index: number;
  name: string;
  subtitle: string;
  bossName: string;
  palette: string;
}

export interface MapNode {
  id: string;
  kind: RoomKind;
  lane: number;
  depth: number;
  connections: string[];
  optional: boolean;
  anchorId?: string;
  visited: boolean;
  revealed: boolean;
}

export interface FloorMap {
  floorIndex: number;
  nodes: MapNode[];
  currentNodeId: string;
}

export interface EnemyDefinition {
  id: string;
  name: string;
  maxHp: number;
  attack: number;
  armor: number;
  movementSpeed: number;
  attackRange: number;
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
  prepared: boolean;
  behavior: EnemyBehavior;
  behaviorStep: number;
  damageTakenThisRound: number;
  reactionCooldown: number;
  turnsSinceAttack: number;
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
  cardId?: string;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  attackMode?: AttackMode;
}

export interface CombatLogEntry {
  id: string;
  tone: 'normal' | 'good' | 'danger' | 'special';
  message: string;
  messageKey?: string;
  params?: Record<string, string | number>;
}

export interface CombatState {
  roomKind: 'combat' | 'elite' | 'boss';
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
  tearMeter: number;
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

export interface RewardOption {
  id: string;
  type: 'resource' | 'item' | 'card' | 'upgrade' | 'action';
  label: string;
  description: string;
  icon: string;
  itemId?: string;
  cardId?: string;
  resource?: 'coins' | 'bombs' | 'keys' | 'red-heart' | 'soul-heart' | 'black-heart';
  amount?: number;
  upgrade?: 'damage' | 'heart' | 'armor' | 'vitality' | 'speed' | 'skill';
  action?: 'enter-deal' | 'skip-deal' | 'leave' | 'sacrifice';
  price?: number;
  sold?: boolean;
}

export interface ChoiceState {
  kind: ChoiceKind;
  title: string;
  subtitle: string;
  options: RewardOption[];
  canSkip: boolean;
  next: 'map' | 'boss-gate' | 'floor-upgrade' | 'next-floor' | 'victory';
  dealType?: 'devil' | 'angel';
}

export interface UnlockNotice {
  itemId: string;
  label: string;
}

export interface RunState {
  id: string;
  seed: string;
  rngState: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  phase: RunPhase;
  floorIndex: number;
  floorMap: FloorMap;
  player: PlayerState;
  combat?: CombatState;
  choice?: ChoiceState;
  currentRoomId?: string;
  clearedRooms: number;
  score: number;
  devilChance: number;
  angelFavor: number;
  tookDevilDeal: boolean;
  unlocks: string[];
  unlockNotices: UnlockNotice[];
  lastReward: string[];
  floorRedDamage: number;
  floorSecretVisits: string[];
  victory: boolean;
}

export interface ProfileState {
  wins: number;
  losses: number;
  bestScore: number;
  unlockedItemIds: string[];
  discoveredItemIds: string[];
  eventFlags: string[];
}

export interface PersistedRun {
  id: string;
  status: 'active' | 'won' | 'lost';
  snapshot: RunState;
  createdAt: string;
  updatedAt: string;
}
