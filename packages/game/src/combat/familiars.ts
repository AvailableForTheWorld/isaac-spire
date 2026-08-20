import type { FamiliarState, ItemDefinition } from '../types.js';
import { AttackMode, FamiliarDirection, ItemEffectFamily, ItemKind, ItemTrait } from '../types.js';

export const FAMILIAR_DIRECTION_ORDER: readonly FamiliarDirection[] = [
  FamiliarDirection.North,
  FamiliarDirection.NorthEast,
  FamiliarDirection.East,
  FamiliarDirection.SouthEast,
  FamiliarDirection.South,
  FamiliarDirection.SouthWest,
  FamiliarDirection.West,
  FamiliarDirection.NorthWest,
];

export const FAMILIAR_DIRECTION_OFFSETS: Readonly<Record<FamiliarDirection, { x: number; y: number }>> = {
  [FamiliarDirection.North]: { x: 0, y: -1 },
  [FamiliarDirection.NorthEast]: { x: 1, y: -1 },
  [FamiliarDirection.East]: { x: 1, y: 0 },
  [FamiliarDirection.SouthEast]: { x: 1, y: 1 },
  [FamiliarDirection.South]: { x: 0, y: 1 },
  [FamiliarDirection.SouthWest]: { x: -1, y: 1 },
  [FamiliarDirection.West]: { x: -1, y: 0 },
  [FamiliarDirection.NorthWest]: { x: -1, y: -1 },
};

export function isFamiliarItem(item: ItemDefinition | undefined): item is ItemDefinition {
  return Boolean(
    item &&
    item.kind === ItemKind.Passive &&
    (item.family === ItemEffectFamily.Familiar || item.originalTraits?.includes(ItemTrait.Familiar)),
  );
}

function familiarAttackMode(traits: ReadonlySet<ItemTrait>): AttackMode {
  if (traits.has(ItemTrait.Brimstone)) return AttackMode.Brimstone;
  if (traits.has(ItemTrait.Knife)) return AttackMode.Knife;
  if (traits.has(ItemTrait.Laser)) return AttackMode.TechX;
  return AttackMode.Basic;
}

/**
 * Compiles collectible metadata into a deterministic round attacker. Every
 * eight assistants start a new visual ring, so no owned familiar is discarded.
 */
export function createFamiliarState(
  item: ItemDefinition,
  index: number,
  playerBaseDamage: number,
  playerDamageMultiplier: number,
): FamiliarState {
  const traits = new Set(item.originalTraits ?? []);
  const quality = Math.max(0, Number(item.quality));
  const multiShot = traits.has(ItemTrait.MultiShot) || traits.has(ItemTrait.SplitShot);
  const damageRatio = 0.32 + quality * 0.08;
  const traitDamage = traits.has(ItemTrait.DamageUp) ? 1 : 0;
  const damage = Math.max(
    1,
    Math.round(playerBaseDamage * playerDamageMultiplier * damageRatio + traitDamage),
  );

  return {
    instanceId: `familiar:${item.id}`,
    itemId: item.id,
    direction: FAMILIAR_DIRECTION_ORDER[index % FAMILIAR_DIRECTION_ORDER.length]!,
    ring: Math.floor(index / FAMILIAR_DIRECTION_ORDER.length) + 1,
    damage,
    hits: multiShot ? 2 : 1,
    attackMode: familiarAttackMode(traits),
    projectileScale: 0.72 + quality * 0.07,
    splashDamageRatio: traits.has(ItemTrait.Explosive) ? 0.5 : 0,
    poisonTurns: traits.has(ItemTrait.Poison) ? 1 + Math.ceil(quality / 2) : 0,
    poisonDamage: traits.has(ItemTrait.Poison) ? 1 + Math.ceil(quality / 2) : 0,
    slowTurns: traits.has(ItemTrait.Slow) || traits.has(ItemTrait.Freeze) ? 1 + Math.floor(quality / 2) : 0,
  };
}
