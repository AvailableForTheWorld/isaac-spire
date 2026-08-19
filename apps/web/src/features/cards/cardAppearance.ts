import { CardType, ITEMS, type CardDefinition, type ItemDefinition } from '@isaac-spire/game';

export function itemForCard(card: CardDefinition): ItemDefinition | undefined {
  if (card.itemId) return ITEMS[card.itemId];
  if (card.type !== CardType.Skill) return undefined;
  return Object.values(ITEMS).find((item) => item.skillCardId === card.id);
}

export function cardAppearanceClass(card?: CardDefinition, item?: ItemDefinition): string {
  const resolvedItem = item ?? (card ? itemForCard(card) : undefined);
  if (resolvedItem) return `item-card item-quality-${resolvedItem.quality}`;
  if (card?.type === CardType.Tarot) return 'tarot-card';
  return card ? 'standard-card' : '';
}
