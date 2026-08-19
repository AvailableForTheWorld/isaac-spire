# Collectible adaptation system

## Scope and sources

The built-in content pack contains every valid collectible ID from 1 through 732 in the Repentance / Repentance+ catalog: 718 collectibles in total. The source manifest classifies 170 active or active-hybrid items and 548 passive, familiar, orbital, bomb-modifier, or attack-modifier items. Trinkets, pills, runes, cards, and pickups are separate future content packs and are not counted as collectibles here.

The generator combines:

- External Item Descriptions for the current English Repentance+ overrides and Simplified Chinese collectible names.
- The `akex06/items.json` Repentance dataset for collectible IDs, original active/passive type, quality, recharge, pools, and effect text used only during semantic classification.

Only compact metadata and our own adapted gameplay descriptions are generated into the repository. The source effect prose is not copied into runtime content.

Regenerate the catalog with Node 24:

```powershell
node scripts/generate-isaac-item-manifest.mjs
pnpm exec prettier --write packages/game/src/content/isaac-items.generated.ts
```

The generator asserts that exactly 718 collectible records were produced. The generated file must not be hand-edited; balance exceptions belong in `catalog.ts` or `content/custom-items.ts`.

## Three-layer design

`isaac-items.generated.ts` is the research layer. Each record has a stable Isaac ID, stable project slug, English and Chinese name, original kind, quality, recharge, source room pools, broad semantic mechanics, and concrete original-effect traits such as homing, piercing, multishot, poison, black hearts, rerolling, or card generation.

`item-adaptation.ts` is the balance layer. It composes each collectible's concrete traits into serializable `CardEffectOpcode` instructions. Damage tradeoffs, firing forms, resources, statuses, map control, defense, and card flow can coexist in one recipe. The current catalog produces 377 distinct trait combinations, 454 distinct executable effect recipes, and 1,778 effect instructions for the 718 source collectibles. A broad family is used only when the source text exposes no directly translatable trait; that fallback becomes a usable draw/cycle or tactical effect rather than an inert entry.

`isaac-action-items.ts` is the authored behavior layer. The current pass contains 116 collectibles whose identity depends on rerolling, copying, revival, recharge, damage/kill/round/room callbacks, resource conversion, or state transitions. They declare one or more `ItemActionDefinition` instructions instead of pretending to be static stat changes. The engine dispatches these instructions at typed lifecycle boundaries. Plain numerical collectibles intentionally remain in the generated balance layer.

Curated and project definitions override generated definitions by both stable project ID and original `isaacId`. This keeps aliases from creating two runtime collectibles and guarantees that project-authored items win. R Key, Damocles, Diplopia, Steam Sale, and the existing signature definitions are deliberately excluded from the generated action override table.

## Authored action lifecycle

An action has a stable ID, an `ItemActionTrigger`, an `ItemActionMethod`, and optional chance, cadence, per-combat limit, consumption, numeric arguments, and follow-up effects. Current trigger boundaries include activation, combat/round start and end, card play, movement, player damage, enemy kill, fatal damage, and room clear.

The method dispatcher supports effect bundles as well as stateful operations such as:

- duplicating or replaying cards;
- rerolling enemies, item cards, the whole hand, or player combat stats;
- Spindown conversion by original collectible ID;
- restarting a room or floor;
- generating, consuming, or transforming item cards;
- revival and one-use item removal;
- active-item recharge and Car Battery repetition;
- converting shield to health, spending coins for room damage, and triggering damage listeners;
- Rock Bottom stat-floor locking, map reveal, mass defeat, and random item-effect execution.

Passive action listeners become live only after their Item card has been played in that combat, unless the item is explicitly permanent. This preserves the project's deckbuilding rule instead of granting every owned passive for free.

## Manifest-to-run chain

1. The generator analyzes the original effect text into `ItemMechanic` and `ItemTrait` enum values.
2. `adaptIsaacItem` turns those traits into a cost, target, fusion behavior, and one or more executable effects.
3. `catalog.ts` creates `skill:<item-id>` for active items and `item:<item-id>` for passive items.
4. Picking up an active item adds its retained, rechargeable Skill card and replaces the previous active card. Picking up a combat passive adds its reusable Item card to the deck.
5. Explicit utility passives still receive a card definition for inspection, but apply on acquisition and stay in the item rail, honoring the non-combat-item rule. Explicit run/floor pocket items are the only non-deck exceptions.
6. `playCard` dispatches generated numeric instructions through the effect interpreter and authored special behavior through the lifecycle action dispatcher. An action-driven active item bypasses the legacy item switch, so it cannot execute twice through two code paths.

The all-collectible test walks this chain for every source ID (resolving an authored alias by `isaacId`) and fails if a collectible has neither a reachable card nor an explicit pocket action. A separate invariant test rejects duplicate runtime `isaacId` values and verifies that every authored action uses enum-backed triggers and methods.

## Fallback adaptation families

| Family   | Tactical adaptation                                            |
| -------- | -------------------------------------------------------------- |
| Assault  | Combat damage plus a one-attack fusion multiplier              |
| Volley   | Fire-rate growth, high-quality draw, projectile-size fusion    |
| Familiar | Damage to all enemies; medium/high quality also draws          |
| Defense  | Shield; quality 4 also grants combat armor                     |
| Sustain  | Red-heart recovery; quality 4 also grants shield               |
| Mobility | Combat movement and attack range                               |
| Status   | Silence, poison, blind, armor break, weak, or item lock        |
| Bomb     | Room-wide damage                                               |
| Economy  | Immediate coins and related card-flow utility                  |
| Mapping  | Hidden-room or full-floor reveal from the played card          |
| Reroll   | Limited hand reroll                                            |
| Draw     | Additional cards                                               |
| Cycle    | Discard Blank/Curse cards first, then replace the cycled cards |
| Wildcard | A smaller draw-and-shield bundle                               |

Quality 0–4 controls card cost and effect magnitude. Active items become retained rechargeable Skill cards unless a curated rule changes their timing. Generated passives—including mapping and economy items—become reusable Item cards. Only explicitly curated permanent upgrades and non-combat utility items stay in the item rail. Unmappable effects deliberately become Draw or Cycle effects to keep card flow varied.

## Use timings

- `active-charge`: retained active-item Skill card with segmented recharge.
- `combat-card`: reusable passive Item card.
- `permanent`: applied on pickup and never added to combat piles.
- `run-once`: pocket item consumed after one use in the run.
- `floor-once`: pocket item retained but disabled after use until the next floor.
- `combat-once`: card remains in the deck but cannot be used again in the same room.

The pocket bar has three slots. Travel Pack edits a deck to exactly 30 cards and fills unused capacity with Blank cards. Diplopia duplicates selected cards. R Key preserves the build and restarts at Basement I. Steam Sale applies a permanent 50% shop discount. Holy Protection clears current player debuffs once per floor.

## Status model

Statuses use `StatusKind` and duration maps on both players and enemies:

- Silence blocks attack cards/actions.
- Poison deals direct HP damage at the next turn resolution.
- Blind shuffles and hides the player's hand; blinded monsters execute a newly randomized action instead of the displayed intent.
- Armor Break makes armor zero for damage calculation.
- Weak reduces outgoing attack damage by 50%.
- Item Lock disables player Item/Skill cards and monster special actions.
- Bloat is an enemy curse outcome that adds one or more Blank cards to the player's discard pile and permanent deck.

## Curated risk and deck-control cards

- Damocles doubles numeric item effects and fusion contributions until it falls. Each round end has a 50% fall roll that deals one full-heart-size direct hit.
- Ragnarok removes the retain cap, draws five cards each round, and deals direct damage equal to retained hand size at round end.
- Strong Stimulant ignores vitality costs for five rounds, then permanently removes one maximum vitality.
- Transposition lets the player select non-charged Item cards in the draw pile. The originals enter discard and combat-temporary replacements occupy their draw positions.
- Blank Book lets each Blank card imitate any definition visible in the current draw or discard pile until that Blank is played.
- Regret Medicine restores the room-entry checkpoint and is marked used in the restored combat so it cannot loop.
