import { describe, expect, it } from 'vitest';
import { CARDS, ITEMS } from './catalog.js';
import { CardEffectOpcode, CardType, HeartKind, ItemKind } from './types.js';
import { createIsaac, getPlayerHealth, isPlayerAlive, ISAAC_STARTER_PASSIVE_ITEM_IDS } from './player.js';

describe('Isaac starter deck', () => {
  it('summarizes red, soul, and black hearts as one authoritative health total', () => {
    const player = createIsaac({ rngState: 0x1aac });
    player.redHp = 15;
    player.pocketHearts = [
      { id: 'soul', kind: HeartKind.Soul, hp: 4, maxHp: 10 },
      { id: 'black', kind: HeartKind.Black, hp: 2, maxHp: 10 },
    ];

    expect(getPlayerHealth(player)).toEqual({
      current: 21,
      maximum: 50,
      redCurrent: 15,
      redMaximum: 30,
      pocketCurrent: 6,
      pocketMaximum: 20,
    });
    expect(isPlayerAlive(player)).toBe(true);

    player.redHp = 0;
    player.pocketHearts.forEach((heart) => (heart.hp = 0));
    expect(isPlayerAlive(player)).toBe(false);
  });

  it('uses the requested 15-card early-game composition', () => {
    const player = createIsaac({ rngState: 0x1aac });
    const definitions = player.deck.map((card) => CARDS[card.definitionId]!);
    const count = (type: CardType) => definitions.filter((card) => card.type === type).length;

    expect(player.deck).toHaveLength(15);
    expect(count(CardType.Attack)).toBe(4);
    expect(count(CardType.Shield)).toBe(3);
    expect(count(CardType.Item) + count(CardType.Skill)).toBe(5);
    expect(count(CardType.Recovery)).toBe(1);
    expect(count(CardType.Vitality)).toBe(1);
    expect(count(CardType.Tarot)).toBe(1);
    expect(count(CardType.Hex)).toBe(0);
    expect(player.stats.maxShield).toBe(15);
    expect(player.stats.heartSize).toBe(10);
    expect(player.redHp).toBe(30);
    expect(CARDS['half-heart']?.name).toBe('Treatment');
    expect(CARDS['half-heart']?.value).toBe(10);
    expect(CARDS['vitality-shot']).toMatchObject({
      type: CardType.Vitality,
      cost: 0,
      value: 2,
      exhaust: true,
    });
  });

  it('starts with cycling, status, and attack-fusion items alongside The D6', () => {
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
    expect(ITEMS['sad-onion']?.fusion).toMatchObject({ damageMultiplier: 1.1 });
  });
});
