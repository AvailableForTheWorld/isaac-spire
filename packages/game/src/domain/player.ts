import type {
  AttackMode,
  CardTarget,
  CardType,
  CharacterId,
  HeartKind,
  ItemKind,
  RewardPool,
  RewardQuality,
  UnlockEvent,
} from './enums.js';

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
  character: CharacterId;
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
  target: CardTarget;
  exhaust?: boolean;
  itemId?: string;
  icon: string;
  quality: RewardQuality;
  rewardPools: RewardPool[];
  rewardWeight?: number;
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

export interface AttackFusionEffect {
  damageMultiplier?: number;
  flatDamage?: number;
  projectileScale?: number;
  knockback?: number;
  poisonTurns?: number;
  poisonDamage?: number;
  slowTurns?: number;
  curvedShots?: boolean;
  attackMode?: AttackMode;
}

export interface AttackFusionPreview {
  totalCost: number;
  damageMultiplier: number;
  flatDamage: number;
  projectileScale: number;
  knockback: number;
  poisonTurns: number;
  poisonDamage: number;
  slowTurns: number;
  curvedShots: boolean;
  attackMode?: AttackMode;
}

export interface ItemDefinition {
  id: string;
  name: string;
  kind: ItemKind;
  pool: RewardPool[];
  description: string;
  icon: string;
  quality: RewardQuality;
  chargeRounds?: number;
  skillCardId?: string;
  combatCard?: boolean;
  effects?: ItemEffect[];
  fusion?: AttackFusionEffect;
  unlock?: { event: UnlockEvent; label: string };
}

export interface FloorDefinition {
  index: number;
  name: string;
  subtitle: string;
  bossName: string;
  palette: string;
}
