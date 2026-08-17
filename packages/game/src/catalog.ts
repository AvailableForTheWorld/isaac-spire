import type { CardDefinition, EnemyDefinition, FloorDefinition, ItemDefinition, ProfileState } from './types.js';

export const FLOORS: FloorDefinition[] = [
  { index: 0, name: 'Basement I', subtitle: 'Something stirs below', bossName: 'Monstro', palette: '#75584a' },
  { index: 1, name: 'Basement II', subtitle: 'The walls begin to breathe', bossName: 'Duke of Flies', palette: '#67483f' },
  { index: 2, name: 'Caves I', subtitle: 'Cold stone, hungry dark', bossName: 'Gurdy', palette: '#4d625b' },
  { index: 3, name: 'Caves II', subtitle: 'No way but down', bossName: 'Mega Fatty', palette: '#40564f' },
  { index: 4, name: 'Depths I', subtitle: 'A familiar voice', bossName: 'The Cage', palette: '#5b4a5e' },
  { index: 5, name: 'Depths II', subtitle: 'Mother is watching', bossName: "Mom's Leg", palette: '#693e50' },
];

export const CARDS: Record<string, CardDefinition> = {
  'isaacs-tears': {
    id: 'isaacs-tears', name: "Isaac's Tears", type: 'attack', cost: 1, value: 6,
    description: 'Deal 100% tear damage. Fire rate can echo this hit.', target: 'enemy', icon: '●',
  },
  'double-shot': {
    id: 'double-shot', name: 'Double Shot', type: 'attack', cost: 1, value: 4, hits: 2,
    description: 'Deal 70% tear damage twice.', target: 'enemy', icon: '●●',
  },
  'wide-tears': {
    id: 'wide-tears', name: 'Wide Tears', type: 'attack', cost: 1, value: 4,
    description: 'Deal 65% tear damage to every enemy.', target: 'all-enemies', icon: '◉',
  },
  'wooden-cross': {
    id: 'wooden-cross', name: 'Wooden Cross', type: 'shield', cost: 1, value: 5,
    description: 'Gain 5 shield. Shield persists for the room.', target: 'self', icon: '✚',
  },
  'half-heart': {
    id: 'half-heart', name: 'Half Heart', type: 'recovery', cost: 1, value: 10,
    description: 'Recover 10 red-heart HP.', target: 'self', icon: '♥',
  },
  'bad-trip': {
    id: 'bad-trip', name: 'Bad Trip', type: 'hex', cost: 1, value: 2,
    description: 'Curse an enemy for 2 turns. Its attacks deal 40% less and its special bundles are suppressed.', target: 'enemy', icon: '☠',
  },
  'the-empress': {
    id: 'the-empress', name: 'III · The Empress', type: 'tarot', cost: 1, value: 3,
    description: 'Gain +3 damage for this combat. Exhaust permanently.', target: 'self', exhaust: true, icon: 'Ⅲ',
  },
  death: {
    id: 'death', name: 'XIII · Death', type: 'tarot', cost: 1, value: 25,
    description: 'Deal 25 damage to every enemy. Exhaust permanently.', target: 'all-enemies', exhaust: true, icon: 'ⅩⅢ',
  },
  'the-sun': {
    id: 'the-sun', name: 'XIX · The Sun', type: 'tarot', cost: 1, value: 30,
    description: 'Deal 30 to all enemies and recover 20 HP. Exhaust permanently.', target: 'all-enemies', exhaust: true, icon: '☀',
  },
  'dead-weight': {
    id: 'dead-weight', name: 'Dead Weight', type: 'curse', cost: 99,
    description: 'Unplayable. Created by enemy curses.', target: 'none', icon: '▧',
  },
  'skill-d6': {
    id: 'skill-d6', name: 'The D6', type: 'skill', cost: 2,
    description: 'Reroll every non-skill card in hand. Recharges in 3 rounds.', target: 'none', icon: '⚅',
  },
  'skill-yum-heart': {
    id: 'skill-yum-heart', name: 'Yum Heart', type: 'skill', cost: 1,
    description: 'Recover one full red heart. Recharges in 4 rounds.', target: 'self', icon: '♥',
  },
  'skill-belial': {
    id: 'skill-belial', name: 'Book of Belial', type: 'skill', cost: 1,
    description: 'Gain +2 damage for this room. Recharges in 3 rounds.', target: 'self', icon: '✦',
  },
  'skill-shadows': {
    id: 'skill-shadows', name: 'Book of Shadows', type: 'skill', cost: 1,
    description: 'Gain 20 shield. Recharges in 3 rounds.', target: 'self', icon: '◈',
  },
  'skill-tammy': {
    id: 'skill-tammy', name: "Tammy's Head", type: 'skill', cost: 1,
    description: 'Deal tear damage to all enemies. Recharges in 3 rounds.', target: 'all-enemies', icon: '✺',
  },
  'skill-nail': {
    id: 'skill-nail', name: 'The Nail', type: 'skill', cost: 2,
    description: 'Gain a black heart and +2 armor this room. Recharges in 5 rounds.', target: 'self', icon: '†',
  },
  'skill-hourglass': {
    id: 'skill-hourglass', name: 'Glowing Hour Glass', type: 'skill', cost: 2,
    description: 'All enemies lose their next action. Recharges in 5 rounds.', target: 'all-enemies', icon: '⌛',
  },
};

export const ITEMS: Record<string, ItemDefinition> = {
  d6: {
    id: 'd6', name: 'The D6', kind: 'active', pool: ['treasure'], quality: 4, icon: '⚅', chargeRounds: 3,
    skillCardId: 'skill-d6', description: 'Rerolls the rest of your hand. Isaac starts with it.',
  },
  'yum-heart': {
    id: 'yum-heart', name: 'Yum Heart', kind: 'active', pool: ['treasure', 'shop'], quality: 2, icon: '♥', chargeRounds: 4,
    skillCardId: 'skill-yum-heart', description: 'Recovers a full red heart.',
  },
  'book-belial': {
    id: 'book-belial', name: 'Book of Belial', kind: 'active', pool: ['devil', 'treasure'], quality: 3, icon: '✦', chargeRounds: 3,
    skillCardId: 'skill-belial', description: 'Raises damage for the rest of combat.',
  },
  'book-shadows': {
    id: 'book-shadows', name: 'Book of Shadows', kind: 'active', pool: ['treasure', 'angel'], quality: 3, icon: '◈', chargeRounds: 3,
    skillCardId: 'skill-shadows', description: 'Wraps Isaac in 20 shield.',
  },
  'tammys-head': {
    id: 'tammys-head', name: "Tammy's Head", kind: 'active', pool: ['treasure', 'secret'], quality: 2, icon: '✺', chargeRounds: 3,
    skillCardId: 'skill-tammy', description: 'Fires tears in every direction.',
  },
  'the-nail': {
    id: 'the-nail', name: 'The Nail', kind: 'active', pool: ['devil'], quality: 3, icon: '†', chargeRounds: 5,
    skillCardId: 'skill-nail', description: 'Grants a black heart and room armor.',
  },
  'glowing-hourglass': {
    id: 'glowing-hourglass', name: 'Glowing Hour Glass', kind: 'active', pool: ['shop', 'planetarium'], quality: 3, icon: '⌛', chargeRounds: 5,
    skillCardId: 'skill-hourglass', description: 'Makes every enemy miss its next action.',
  },
  'sad-onion': {
    id: 'sad-onion', name: 'The Sad Onion', kind: 'passive', pool: ['treasure'], quality: 2, icon: '◌',
    description: '+0.25 fire rate. Every four attacks produces a free echo shot.', effects: [{ stat: 'fireRate', amount: 0.25 }],
  },
  'crickets-head': {
    id: 'crickets-head', name: "Cricket's Head", kind: 'passive', pool: ['treasure', 'elite'], quality: 4, icon: '♟',
    description: '×1.5 damage multiplier.', effects: [{ stat: 'damageMultiplier', multiplier: 1.5 }],
  },
  'magic-mushroom': {
    id: 'magic-mushroom', name: 'Magic Mushroom', kind: 'passive', pool: ['treasure', 'boss'], quality: 4, icon: '♠',
    description: 'All stats up and one red-heart container.', effects: [
      { stat: 'damageMultiplier', multiplier: 1.25 }, { stat: 'armor', amount: 1 },
      { stat: 'fireRate', amount: 0.15 }, { redContainers: 1 },
    ],
  },
  breakfast: {
    id: 'breakfast', name: 'Breakfast', kind: 'passive', pool: ['boss'], quality: 1, icon: '⌑',
    description: '+1 red-heart container and a full heal.', effects: [{ redContainers: 1 }],
  },
  squeezy: {
    id: 'squeezy', name: 'Squeezy', kind: 'passive', pool: ['boss'], quality: 3, icon: '≋',
    description: '+0.2 fire rate and two soul hearts.', effects: [{ stat: 'fireRate', amount: 0.2 }, { soulHearts: 2 }],
  },
  'holy-mantle': {
    id: 'holy-mantle', name: 'Holy Mantle', kind: 'passive', pool: ['angel', 'treasure'], quality: 4, icon: '♢',
    description: '+15 starting shield in every room.', effects: [{ stat: 'baseShield', amount: 15 }],
    unlock: { event: 'flawless-floor', label: 'Clear a floor without red-heart damage' },
  },
  'steam-sale': {
    id: 'steam-sale', name: 'Steam Sale', kind: 'passive', pool: ['shop'], quality: 2, icon: '%',
    description: 'Shop prices are 50% lower.', effects: [{ stat: 'shopDiscount', amount: 0.5 }],
    unlock: { event: 'wealthy', label: 'Hold at least 15 coins' },
  },
  compass: {
    id: 'compass', name: 'The Compass', kind: 'passive', pool: ['shop'], quality: 2, icon: '⌖',
    description: 'Reveals every normal room on the floor.', effects: [{ revealAll: true }],
  },
  'blue-map': {
    id: 'blue-map', name: 'Blue Map', kind: 'passive', pool: ['shop', 'secret'], quality: 2, icon: '▦',
    description: 'Reveals secret and super-secret rooms.', effects: [{ revealSecrets: true }],
    unlock: { event: 'secret-hunter', label: 'Open both secret rooms on one floor' },
  },
  pentagram: {
    id: 'pentagram', name: 'Pentagram', kind: 'passive', pool: ['devil', 'elite'], quality: 3, icon: '☆',
    description: '×1.2 damage and +10% Devil chance.', effects: [{ stat: 'damageMultiplier', multiplier: 1.2 }],
  },
  'goat-head': {
    id: 'goat-head', name: 'Goat Head', kind: 'passive', pool: ['devil', 'curse'], quality: 3, icon: '♈',
    description: 'A Devil or Angel room is guaranteed after each boss.', effects: [{ guaranteeDeal: true }],
  },
  wafer: {
    id: 'wafer', name: 'The Wafer', kind: 'passive', pool: ['angel'], quality: 4, icon: '⊙',
    description: 'Enemy hits cannot exceed 15 damage before armor.', effects: [{ damageCap: 15 }],
  },
  'sacred-heart': {
    id: 'sacred-heart', name: 'Sacred Heart', kind: 'passive', pool: ['angel'], quality: 4, icon: '♡',
    description: '×1.6 damage and +15% critical chance.', effects: [
      { stat: 'damageMultiplier', multiplier: 1.6 }, { stat: 'critChance', amount: 0.15 },
    ],
    unlock: { event: 'angel-loyalty', label: 'Skip two Devil rooms in one run' },
  },
  brimstone: {
    id: 'brimstone', name: 'Brimstone', kind: 'passive', pool: ['devil'], quality: 4, icon: '♨',
    description: 'Tears become a beam that hits every enemy for 85% damage.', effects: [{ attackMode: 'brimstone' }],
    unlock: { event: 'mom-clear', label: "Defeat Mom's Leg" },
  },
  'moms-knife': {
    id: 'moms-knife', name: "Mom's Knife", kind: 'passive', pool: ['devil', 'treasure'], quality: 4, icon: '◢',
    description: 'Tears become piercing knife strikes with ×1.6 power.', effects: [{ attackMode: 'knife' }],
    unlock: { event: 'mom-clear', label: "Defeat Mom's Leg" },
  },
  'tech-x': {
    id: 'tech-x', name: 'Tech X', kind: 'passive', pool: ['treasure', 'planetarium'], quality: 4, icon: '◎',
    description: 'Ring shots hit all enemies and erase 3 shield.', effects: [{ attackMode: 'tech-x' }],
    unlock: { event: 'elite-perfect', label: 'Beat an elite without taking damage' },
  },
  'terra': {
    id: 'terra', name: 'Terra', kind: 'passive', pool: ['planetarium'], quality: 3, icon: '●',
    description: '+3 base damage and +1 armor.', effects: [{ stat: 'baseDamage', amount: 3 }, { stat: 'armor', amount: 1 }],
  },
  'luna': {
    id: 'luna', name: 'Luna', kind: 'passive', pool: ['planetarium'], quality: 3, icon: '☾',
    description: '+1 draw and reveals secret rooms.', effects: [{ stat: 'drawCount', amount: 1 }, { revealSecrets: true }],
  },
};

export const DEFAULT_UNLOCKS = Object.values(ITEMS)
  .filter((item) => !item.unlock)
  .map((item) => item.id);

export const DEFAULT_PROFILE: ProfileState = {
  wins: 0,
  losses: 0,
  bestScore: 0,
  unlockedItemIds: DEFAULT_UNLOCKS,
  discoveredItemIds: ['d6'],
  eventFlags: [],
};

const ENEMIES: Record<string, EnemyDefinition> = {
  fly: { id: 'fly', name: 'Attack Fly', maxHp: 18, attack: 9, armor: 0, icon: '✣' },
  pooter: { id: 'pooter', name: 'Pooter', maxHp: 24, attack: 12, armor: 0, icon: '◉' },
  spider: { id: 'spider', name: 'Big Spider', maxHp: 30, attack: 14, armor: 1, icon: '✳' },
  horf: { id: 'horf', name: 'Horf', maxHp: 34, attack: 16, armor: 1, icon: '●' },
  charger: { id: 'charger', name: 'Charger', maxHp: 38, attack: 18, armor: 1, icon: '➤' },
  globin: { id: 'globin', name: 'Globin', maxHp: 44, attack: 17, armor: 2, icon: '♟' },
  knight: { id: 'knight', name: 'Knight', maxHp: 52, attack: 21, armor: 4, icon: '♞' },
  vis: { id: 'vis', name: 'Vis', maxHp: 46, attack: 23, armor: 2, icon: '☢' },
  'leaper': { id: 'leaper', name: 'Leaper', maxHp: 56, attack: 22, armor: 3, icon: '♣' },
  'fat-bat': { id: 'fat-bat', name: 'Fat Bat', maxHp: 88, attack: 23, armor: 3, elite: true, icon: '◆' },
  'champion-knight': { id: 'champion-knight', name: 'Champion Knight', maxHp: 110, attack: 27, armor: 5, elite: true, icon: '♛' },
  monstro: { id: 'monstro', name: 'Monstro', maxHp: 120, attack: 22, armor: 2, boss: true, icon: '◉' },
  duke: { id: 'duke', name: 'Duke of Flies', maxHp: 155, attack: 25, armor: 2, boss: true, icon: '♚' },
  gurdy: { id: 'gurdy', name: 'Gurdy', maxHp: 190, attack: 28, armor: 3, boss: true, icon: '☉' },
  fatty: { id: 'fatty', name: 'Mega Fatty', maxHp: 225, attack: 31, armor: 4, boss: true, icon: '⬤' },
  cage: { id: 'cage', name: 'The Cage', maxHp: 270, attack: 35, armor: 5, boss: true, icon: '▣' },
  mom: { id: 'mom', name: "Mom's Leg", maxHp: 360, attack: 40, armor: 6, boss: true, icon: '♠' },
};

const FLOOR_POOLS = [
  ['fly', 'pooter', 'spider'], ['fly', 'pooter', 'spider'],
  ['horf', 'charger', 'globin'], ['horf', 'charger', 'globin'],
  ['knight', 'vis', 'leaper'], ['knight', 'vis', 'leaper'],
] as const;

const BOSSES = ['monstro', 'duke', 'gurdy', 'fatty', 'cage', 'mom'] as const;

export function getEnemy(id: string): EnemyDefinition {
  const enemy = ENEMIES[id];
  if (!enemy) throw new Error(`Unknown enemy: ${id}`);
  return enemy;
}

export function enemyPoolForFloor(floorIndex: number): EnemyDefinition[] {
  return (FLOOR_POOLS[floorIndex] ?? FLOOR_POOLS[5]).map(getEnemy);
}

export function eliteForFloor(floorIndex: number): EnemyDefinition {
  return getEnemy(floorIndex >= 4 ? 'champion-knight' : 'fat-bat');
}

export function bossForFloor(floorIndex: number): EnemyDefinition {
  return getEnemy(BOSSES[floorIndex] ?? 'mom');
}
