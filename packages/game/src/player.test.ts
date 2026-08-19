import { describe, expect, it } from 'vitest';
import { CARDS, ITEMS } from './catalog.js';
import { CardEffectOpcode, CardType, ItemKind } from './types.js';
import { createIsaac, ISAAC_STARTER_PASSIVE_ITEM_IDS } from './player.js';

describe('Isaac starter deck', () => {
  it('uses the requested 15-card early-game composition', () => {
    const player = createIsaac({ rngState: 0x1aac });
    const definitions = player.deck.map((card) => CARDS[card.definitionId]!);
    const count = (type: CardType) => definitions.filter((card) => card.type === type).length;

    expect(player.deck).toHaveLength(15);
    expect(count(CardType.Attack)).toBe(4);
    expect(count(CardType.Shield)).toBe(4);
    expect(count(CardType.Item) + count(CardType.Skill)).toBe(4);
    expect(count(CardType.Recovery)).toBe(2);
    expect(count(CardType.Tarot)).toBe(1);
    expect(count(CardType.Hex)).toBe(0);
  });

  it('starts with two hand-cycling items and one status item alongside The D6', () => {
    const player = createIsaac({ rngState: 0x1aac });

    expect(player.activeItemId).toBe('d6');
    expect(player.items).toEqual(['d6', ...ISAAC_STARTER_PASSIVE_ITEM_IDS]);
    for (const itemId of ISAAC_STARTER_PASSIVE_ITEM_IDS) {
      expect(ITEMS[itemId]?.kind, itemId).toBe(ItemKind.Passive);
      expect(
        player.deck.some((card) => card.definitionId === `item:${itemId}`),
        itemId,
      ).toBe(true);
    }

    expect(CARDS['item:battery-pack']?.effects).toEqual(
      expect.arrayContaining([expect.objectContaining({ opcode: CardEffectOpcode.Draw })]),
    );
    expect(CARDS['item:starter-deck']?.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ opcode: CardEffectOpcode.Draw }),
        expect.objectContaining({ opcode: CardEffectOpcode.Cycle }),
      ]),
    );
    expect(CARDS['item:the-common-cold']?.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ opcode: CardEffectOpcode.ApplyStatus }),
        expect.objectContaining({ opcode: CardEffectOpcode.Cycle }),
      ]),
    );
  });
});
