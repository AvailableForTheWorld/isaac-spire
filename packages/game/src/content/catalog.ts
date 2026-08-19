import { CARDS, ENEMIES, FLOORS, ITEMS } from '../catalog.js';
import type { CardDefinition, EnemyDefinition, FloorDefinition, ItemDefinition } from '../types.js';
import { ContentRegistry, type ContentPack } from './registry.js';

export type GameContentPack = ContentPack<CardDefinition, ItemDefinition, EnemyDefinition, FloorDefinition>;

export interface GameContentCatalog {
  cards: ContentRegistry<string, CardDefinition>;
  items: ContentRegistry<string, ItemDefinition>;
  enemies: ContentRegistry<string, EnemyDefinition>;
  floors: ContentRegistry<number, FloorDefinition>;
}

export const BUILTIN_CONTENT_PACK: GameContentPack = {
  id: 'isaac-spire.base',
  version: '1.0.0',
  cards: Object.values(CARDS),
  items: Object.values(ITEMS),
  enemies: Object.values(ENEMIES),
  floors: FLOORS,
};

/** Compose the base game, later acts, mods and PvP-only content without editing engine code. */
export function createContentCatalog(
  packs: readonly GameContentPack[] = [BUILTIN_CONTENT_PACK],
): GameContentCatalog {
  const catalog: GameContentCatalog = {
    cards: new ContentRegistry<string, CardDefinition>([], (entry) => entry.id),
    items: new ContentRegistry<string, ItemDefinition>([], (entry) => entry.id),
    enemies: new ContentRegistry<string, EnemyDefinition>([], (entry) => entry.id),
    floors: new ContentRegistry<number, FloorDefinition>([], (entry) => entry.index),
  };
  for (const pack of packs) {
    catalog.cards.registerAll(pack.cards ?? []);
    catalog.items.registerAll(pack.items ?? []);
    catalog.enemies.registerAll(pack.enemies ?? []);
    catalog.floors.registerAll(pack.floors ?? []);
  }
  return catalog;
}

export const GAME_CONTENT = createContentCatalog();
