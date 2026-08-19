import { describe, expect, it } from 'vitest';
import { CARDS, ITEMS, itemUsesCombatCard, passiveCardId } from '../catalog.js';
import { CardEffectOpcode, CardType, ItemKind, ItemUseTiming, RewardQuality } from '../domain/enums.js';
import { createRun, usePocketItem } from '../engine.js';
import { equipItem } from '../player.js';
import type { ItemDefinition } from '../domain/player.js';
import { FULL_ISAAC_ITEMS, FULL_ISAAC_ITEM_MANIFEST } from './isaac-items.generated.js';

function runtimeItemFor(source: (typeof FULL_ISAAC_ITEM_MANIFEST)[number]): ItemDefinition {
  const item =
    ITEMS[source.id] ?? Object.values(ITEMS).find((candidate) => candidate.isaacId === source.isaacId);
  if (!item) throw new Error(`Missing runtime collectible ${source.isaacId}:${source.id}`);
  return item;
}

describe('full Isaac collectible content pack', () => {
  it('contains every valid Repentance collectible with stable bilingual metadata', () => {
    expect(FULL_ISAAC_ITEM_MANIFEST).toHaveLength(718);
    expect(new Set(FULL_ISAAC_ITEM_MANIFEST.map((item) => item.isaacId)).size).toBe(718);
    expect(new Set(FULL_ISAAC_ITEM_MANIFEST.map((item) => item.id)).size).toBe(718);
    expect(FULL_ISAAC_ITEM_MANIFEST.filter((item) => item.kind === ItemKind.Active)).toHaveLength(170);
    expect(FULL_ISAAC_ITEM_MANIFEST.filter((item) => item.kind === ItemKind.Passive)).toHaveLength(548);
    expect(Math.min(...FULL_ISAAC_ITEM_MANIFEST.map((item) => item.isaacId))).toBe(1);
    expect(Math.max(...FULL_ISAAC_ITEM_MANIFEST.map((item) => item.isaacId))).toBe(732);

    for (const source of FULL_ISAAC_ITEM_MANIFEST) {
      const item = runtimeItemFor(source);
      expect(item, source.id).toBeDefined();
      expect(source.nameZh.length, source.id).toBeGreaterThan(0);
      expect(source.mechanics.length, source.id).toBeGreaterThan(0);
      expect(source.quality, source.id).toBeGreaterThanOrEqual(RewardQuality.Poor);
      expect(source.quality, source.id).toBeLessThanOrEqual(RewardQuality.Legendary);
    }
  });

  it('compiles every source collectible into a concrete executable effect recipe', () => {
    const generated = Object.values(FULL_ISAAC_ITEMS);
    expect(generated).toHaveLength(718);
    for (const item of generated) {
      expect(item.cardEffects?.length, item.id).toBeGreaterThan(0);
      expect(item.originalTraits, item.id).toBeDefined();
      expect(item.kind === ItemKind.Active ? item.skillCardId : passiveCardId(item.id), item.id).toBeTruthy();
    }

    const traitRecipes = new Set(FULL_ISAAC_ITEM_MANIFEST.map((item) => item.traits.join('|')));
    const effectRecipes = new Set(generated.map((item) => JSON.stringify(item.cardEffects)));
    expect(traitRecipes.size).toBeGreaterThan(350);
    expect(effectRecipes.size).toBeGreaterThan(400);
    expect(
      generated.filter((item) =>
        item.cardEffects?.some((effect) =>
          [CardEffectOpcode.Draw, CardEffectOpcode.Cycle].includes(effect.opcode),
        ),
      ).length,
    ).toBeGreaterThan(150);
  });

  it('maps every collectible to a card in the run or an explicit non-combat pocket exception', () => {
    const base = createRun('ALL-COLLECTIBLE-CARDS');
    for (const source of FULL_ISAAC_ITEM_MANIFEST) {
      const item = runtimeItemFor(source);
      expect(item, source.id).toBeDefined();
      const run = structuredClone(base);
      run.player.items = [];
      run.player.activeItemId = undefined;
      run.player.pocketItems = [];
      equipItem(run, item.id);

      if (item.pocketAction) {
        expect(
          run.player.pocketItems.some((entry) => entry.itemId === item.id),
          item.id,
        ).toBe(true);
        continue;
      }
      if (item.kind === ItemKind.Active) {
        expect(item.skillCardId, item.id).toBeTruthy();
        expect(CARDS[item.skillCardId!], item.id).toBeDefined();
        expect(
          run.player.deck.some((card) => card.definitionId === item.skillCardId),
          item.id,
        ).toBe(true);
        continue;
      }
      expect(item.kind, item.id).toBe(ItemKind.Passive);
      expect(CARDS[passiveCardId(item.id)], item.id).toBeDefined();
      if (itemUsesCombatCard(item)) {
        expect(
          run.player.deck.some((card) => card.definitionId === passiveCardId(item.id)),
          item.id,
        ).toBe(true);
      } else {
        expect(run.player.items, item.id).toContain(item.id);
      }
    }
  });

  it('gives every final active collectible a playable retained skill definition', () => {
    for (const item of Object.values(ITEMS).filter((entry) => entry.kind === ItemKind.Active)) {
      expect(item.timing, item.id).toBe(ItemUseTiming.ActiveCharge);
      expect(item.skillCardId, item.id).toBeTruthy();
      expect(CARDS[item.skillCardId!], item.id).toBeDefined();
    }
  });

  it('uses Travel Pack to build exactly 30 cards and fill empty capacity with Blank cards', () => {
    let run = createRun('TRAVEL-PACK-TEST');
    equipItem(run, 'travel-pack');
    const pocket = run.player.pocketItems.find((item) => item.itemId === 'travel-pack')!;
    const selected = run.player.deck
      .filter((card) => CARDS[card.definitionId]?.type !== CardType.Skill)
      .slice(0, 2)
      .map((card) => card.instanceId);
    run = usePocketItem(run, pocket.instanceId, selected);

    expect(run.player.deck).toHaveLength(30);
    expect(run.player.deck.filter((card) => card.definitionId === 'blank')).toHaveLength(27);
    expect(run.player.deck.some((card) => card.definitionId === 'skill-d6')).toBe(true);
    expect(run.player.pocketItems.some((item) => item.itemId === 'travel-pack')).toBe(false);
  });

  it('duplicates selected deck cards with Diplopia and preserves the build through R Key', () => {
    let run = createRun('DIPLOPIA-R-KEY');
    equipItem(run, 'diplopia');
    equipItem(run, 'r-key');
    const originalSize = run.player.deck.length;
    const selected = run.player.deck.slice(0, 3).map((card) => card.instanceId);
    const diplopia = run.player.pocketItems.find((item) => item.itemId === 'diplopia')!;
    run = usePocketItem(run, diplopia.instanceId, selected);
    expect(run.player.deck).toHaveLength(originalSize + 3);

    run.floorIndex = 4;
    const preservedDeck = run.player.deck.map((card) => card.definitionId);
    const rKey = run.player.pocketItems.find((item) => item.itemId === 'r-key')!;
    run = usePocketItem(run, rKey.instanceId);
    expect(run.floorIndex).toBe(0);
    expect(run.player.deck.map((card) => card.definitionId)).toEqual(preservedDeck);
    expect(run.player.pocketItems.some((item) => item.itemId === 'r-key')).toBe(false);
  });

  it('applies the run-long Steam Sale discount only when its pocket item is used', () => {
    let run = createRun('STEAM-SALE-POCKET');
    equipItem(run, 'steam-sale');
    expect(run.player.stats.shopDiscount).toBe(0);
    const sale = run.player.pocketItems.find((item) => item.itemId === 'steam-sale')!;
    run = usePocketItem(run, sale.instanceId);
    expect(run.player.stats.shopDiscount).toBe(0.5);
  });
});
