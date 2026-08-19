import { CARDS, ITEMS, itemUsesCombatCard, passiveCardId } from './catalog.js';
import type { CardInstance, HeartKind, PlayerState, RunState } from './types.js';
import { AttackMode, CardEffectOpcode, CharacterId, ItemKind } from './types.js';
import { randomInt } from './random.js';

export const ISAAC_STARTER_PASSIVE_ITEM_IDS = ['battery-pack', 'starter-deck', 'the-common-cold'] as const;

export const ISAAC_STARTER_DECK_RECIPE = [
  { definitionId: 'basic-attack', count: 4 },
  { definitionId: 'wooden-cross', count: 4 },
  ...ISAAC_STARTER_PASSIVE_ITEM_IDS.map((itemId) => ({
    definitionId: passiveCardId(itemId),
    count: 1,
  })),
  { definitionId: 'skill-d6', count: 1 },
  { definitionId: 'half-heart', count: 2 },
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
    redHp: 90,
    pocketHearts: [],
    stats: {
      baseDamage: 6,
      damageMultiplier: 1,
      armor: 3,
      baseShield: 10,
      heartSize: 30,
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
