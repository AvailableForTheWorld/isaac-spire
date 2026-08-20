import { CARDS, ITEMS, itemUsesCombatCard, passiveCardId } from './catalog.js';
import type { CardInstance, PlayerState, RunState } from './types.js';
import {
  AttackMode,
  CardEffectOpcode,
  CharacterId,
  DEFAULT_HEART_SIZE,
  HEART_SIZE_UPGRADE_AMOUNT,
  HeartKind,
  ItemKind,
  MAX_RED_CONTAINERS,
} from './types.js';
import { randomInt } from './random.js';

export const ISAAC_STARTER_PASSIVE_ITEM_IDS = [
  'battery-pack',
  'starter-deck',
  'the-common-cold',
  'sad-onion',
] as const;
export const DEFAULT_MAX_SHIELD = 15;

export const ISAAC_STARTER_DECK_RECIPE = [
  { definitionId: 'basic-attack', count: 4 },
  { definitionId: 'wooden-cross', count: 3 },
  ...ISAAC_STARTER_PASSIVE_ITEM_IDS.map((itemId) => ({
    definitionId: passiveCardId(itemId),
    count: 1,
  })),
  { definitionId: 'skill-d6', count: 1 },
  { definitionId: 'half-heart', count: 1 },
  { definitionId: 'vitality-shot', count: 1 },
  { definitionId: 'the-empress', count: 1 },
] as const;

export function createCard(run: Pick<RunState, 'rngState'>, definitionId: string): CardInstance {
  if (!CARDS[definitionId]) throw new Error(`Unknown card: ${definitionId}`);
  return {
    instanceId: `c-${randomInt(run, 100000, 999999)}-${definitionId}`,
    definitionId,
    upgraded: false,
  };
}

export function createIsaac(run: Pick<RunState, 'rngState'>): PlayerState {
  const player: PlayerState = {
    character: CharacterId.Isaac,
    redContainers: 3,
    redHp: 3 * DEFAULT_HEART_SIZE,
    pocketHearts: [],
    stats: {
      baseDamage: 6,
      damageMultiplier: 1,
      armor: 3,
      baseShield: 10,
      maxShield: DEFAULT_MAX_SHIELD,
      heartSize: DEFAULT_HEART_SIZE,
      maxVitality: 5,
      drawCount: 7,
      maxRetain: 5,
      fireRate: 1,
      luck: 0,
      critChance: 0.05,
      dodgeChance: 0,
      shopDiscount: 0,
      movementSpeed: 3,
      attackRange: 5,
      attackMode: AttackMode.Basic,
    },
    coins: 5,
    bombs: 1,
    keys: 1,
    items: ['d6', ...ISAAC_STARTER_PASSIVE_ITEM_IDS],
    activeItemId: 'd6',
    pocketItems: [],
    pocketItemSlots: 3,
    deck: [],
  };
  const starterCards = ISAAC_STARTER_DECK_RECIPE.flatMap(({ definitionId, count }) =>
    Array<string>(count).fill(definitionId),
  );
  player.deck = starterCards.map((id) => createCard(run, id));
  return player;
}

export function maxRedHp(player: PlayerState): number {
  return player.redContainers * player.stats.heartSize;
}

export function clampPlayerHealth(player: PlayerState): void {
  if (!Number.isFinite(player.stats.heartSize) || player.stats.heartSize <= 0) {
    player.stats.heartSize = DEFAULT_HEART_SIZE;
  }
  player.redContainers = Math.max(0, Math.min(MAX_RED_CONTAINERS, Math.round(player.redContainers)));
  player.redHp = Math.max(0, Math.min(maxRedHp(player), player.redHp));
}

export function addRedContainers(player: PlayerState, requested: number): number {
  const before = Math.max(0, Math.min(MAX_RED_CONTAINERS, Math.round(player.redContainers)));
  player.redContainers = before;
  player.redContainers = Math.min(MAX_RED_CONTAINERS, before + Math.max(0, Math.round(requested)));
  const added = player.redContainers - before;
  player.redHp = Math.min(maxRedHp(player), player.redHp + added * player.stats.heartSize);
  return added;
}

export function increaseHeartSize(player: PlayerState, requested = HEART_SIZE_UPGRADE_AMOUNT): number {
  const added = Math.max(0, Math.round(requested));
  if (!added) return 0;
  player.stats.heartSize += added;
  player.redHp = Math.min(maxRedHp(player), player.redHp + player.redContainers * added);
  player.pocketHearts.forEach((heart) => {
    heart.maxHp += added;
    heart.hp = Math.min(heart.maxHp, heart.hp + added);
  });
  return added;
}

export interface PlayerHealth {
  current: number;
  maximum: number;
  redCurrent: number;
  redMaximum: number;
  pocketCurrent: number;
  pocketMaximum: number;
}

export function getPlayerHealth(player: PlayerState): PlayerHealth {
  const redMaximum = Math.max(0, maxRedHp(player));
  const redCurrent = Math.max(0, Math.min(redMaximum, player.redHp));
  const pocketCurrent = player.pocketHearts.reduce(
    (total, heart) => total + Math.max(0, Math.min(heart.maxHp, heart.hp)),
    0,
  );
  const pocketMaximum = player.pocketHearts.reduce((total, heart) => total + Math.max(0, heart.maxHp), 0);
  return {
    current: redCurrent + pocketCurrent,
    maximum: redMaximum + pocketMaximum,
    redCurrent,
    redMaximum,
    pocketCurrent,
    pocketMaximum,
  };
}

export function isPlayerAlive(player: PlayerState): boolean {
  return getPlayerHealth(player).current > 0;
}

export function healRed(player: PlayerState, amount: number): number {
  const before = player.redHp;
  player.redHp = Math.min(maxRedHp(player), player.redHp + amount);
  return player.redHp - before;
}

export function addPocketHeart(run: RunState, kind: HeartKind, count = 1): void {
  for (let index = 0; index < count; index += 1) {
    run.player.pocketHearts.push({
      id: `h-${randomInt(run, 100000, 999999)}`,
      kind,
      hp: run.player.stats.heartSize,
      maxHp: run.player.stats.heartSize,
    });
  }
}

export function hasItemEffect(
  run: RunState,
  effect: keyof NonNullable<(typeof ITEMS)[string]['effects']>[number],
): boolean {
  return run.player.items.some((id) => ITEMS[id]?.effects?.some((entry) => entry[effect] !== undefined));
}

export function getItemEffectTotal(run: RunState, effect: 'damageCap'): number | undefined {
  const values = run.player.items.flatMap(
    (id) =>
      ITEMS[id]?.effects
        ?.map((entry) => entry[effect])
        .filter((value): value is number => value !== undefined) ?? [],
  );
  return values.length ? Math.min(...values) : undefined;
}

export function equipItem(run: RunState, itemId: string): void {
  const item = ITEMS[itemId];
  if (!item) throw new Error(`Unknown item: ${itemId}`);
  const newlyEquipped = !run.player.items.includes(item.id);
  if (item.kind === ItemKind.Consumable) {
    if (run.player.pocketItems.length >= run.player.pocketItemSlots) {
      throw new Error('Every pocket-item slot is occupied');
    }
    run.player.pocketItems.push({
      instanceId: `p-${randomInt(run, 100000, 999999)}-${item.id}`,
      itemId: item.id,
      used: false,
    });
    return;
  }
  if (item.kind === ItemKind.Active) {
    if (run.player.activeItemId) {
      const previous = ITEMS[run.player.activeItemId];
      if (previous?.skillCardId) {
        run.player.deck = run.player.deck.filter((card) => card.definitionId !== previous.skillCardId);
      }
      run.player.items = run.player.items.filter((id) => id !== run.player.activeItemId);
    }
    run.player.activeItemId = item.id;
    if (item.skillCardId) run.player.deck.push(createCard(run, item.skillCardId));
    if (!run.player.items.includes(item.id)) run.player.items.push(item.id);
  }
  if (newlyEquipped && item.kind === ItemKind.Passive) run.player.items.push(item.id);
  if (newlyEquipped && item.kind === ItemKind.Passive && !itemUsesCombatCard(item)) {
    for (const effect of item.effects ?? []) {
      if (effect.redContainers) {
        addRedContainers(run.player, effect.redContainers);
      }
      if (effect.heartSize) increaseHeartSize(run.player, effect.heartSize);
      if (effect.soulHearts) addPocketHeart(run, HeartKind.Soul, Math.max(0, Math.round(effect.soulHearts)));
      if (effect.blackHearts)
        addPocketHeart(run, HeartKind.Black, Math.max(0, Math.round(effect.blackHearts)));
      if (!effect.stat) continue;
      const stat = effect.stat;
      const current = run.player.stats[stat];
      const multiplied = effect.multiplier === undefined ? current : current * effect.multiplier;
      const updated = multiplied + (effect.amount ?? 0);
      run.player.stats[stat] = stat === 'shopDiscount' ? Math.min(0.9, updated) : updated;
    }
    for (const effect of item.cardEffects ?? []) {
      if (effect.opcode === CardEffectOpcode.GainCoins) run.player.coins += Math.round(effect.amount ?? 0);
      if (effect.opcode === CardEffectOpcode.GainBombs) run.player.bombs += Math.round(effect.amount ?? 0);
      if (effect.opcode === CardEffectOpcode.GainKeys) run.player.keys += Math.round(effect.amount ?? 0);
    }
  }
  if (itemUsesCombatCard(item)) {
    const definitionId = passiveCardId(item.id);
    if (!run.player.deck.some((card) => card.definitionId === definitionId)) {
      run.player.deck.push(createCard(run, definitionId));
    }
  }
}
