export type CardType = 'attack' | 'skill' | 'item' | 'recovery' | 'shield' | 'hex' | 'tarot' | 'curse';
export type AttackMode = 'basic' | 'knife' | 'brimstone' | 'tech-x';
export type HeartKind = 'soul' | 'black';
export type ItemKind = 'active' | 'passive';

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
  pool: Array<
    | 'treasure'
    | 'shop'
    | 'boss'
    | 'devil'
    | 'angel'
    | 'planetarium'
    | 'secret'
    | 'elite'
    | 'curse'
    | 'large-room'
  >;
  description: string;
  icon: string;
  quality: 1 | 2 | 3 | 4;
  chargeRounds?: number;
  skillCardId?: string;
  combatCard?: boolean;
  effects?: ItemEffect[];
  fusion?: AttackFusionEffect;
  unlock?: { event: string; label: string };
}

export interface FloorDefinition {
  index: number;
  name: string;
  subtitle: string;
  bossName: string;
  palette: string;
}
