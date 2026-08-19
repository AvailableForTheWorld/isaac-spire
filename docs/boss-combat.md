# Boss combat and floor difficulty

## Design basis

The Isaac boss catalog is too large and varied to model as one `if` branch per boss. The source roster contains more than one hundred bosses and also notes that champion variants can change attacks. The implementation therefore classifies attacks by their spatial rule, then lets each boss compose two instructions per turn from those reusable rules.

Research references:

- Full roster and champion behavior: [Bosses](https://bindingofisaacrebirth.wiki.gg/wiki/Bosses) and [boss category](https://bindingofisaacrebirth.wiki.gg/wiki/Category:Bosses).
- First-run identities: [Monstro](https://bindingofisaacrebirth.wiki.gg/wiki/Monstro), [The Duke of Flies](https://bindingofisaacrebirth.wiki.gg/wiki/The_Duke_of_Flies), [Gurdy](https://bindingofisaacrebirth.wiki.gg/wiki/Gurdy), [Mega Fatty](https://bindingofisaacrebirth.wiki.gg/wiki/Mega_Fatty), [The Cage](https://bindingofisaacrebirth.wiki.gg/wiki/The_Cage), and [Mom](https://bindingofisaacrebirth.wiki.gg/wiki/Mom).
- Late-game coverage: [Hush](https://bindingofisaacrebirth.wiki.gg/wiki/Hush), [Mega Satan](https://bindingofisaacrebirth.wiki.gg/wiki/Mega_Satan), [Dogma](https://bindingofisaacrebirth.wiki.gg/wiki/Dogma), [Ultra Greed](https://bindingofisaacrebirth.wiki.gg/wiki/Ultra_Greed), [The Beast](https://bindingofisaacrebirth.wiki.gg/wiki/The_Beast), and [Delirium](https://bindingofisaacrebirth.wiki.gg/wiki/Delirium).

## Reusable attack archetypes

`BossAttackPattern` is a stable enum. `ISAAC_BOSS_ATTACK_ARCHETYPES` records the tactical meaning and representative Isaac bosses. `boss-patterns.ts` contains content profiles; `engine.ts` only resolves the spatial primitives.

| Pattern           | Grid adaptation                           | Counterplay                       |
| ----------------- | ----------------------------------------- | --------------------------------- |
| Contact           | Normal footprint range                    | Stay outside the shown range      |
| Projectile spread | Area centered on the telegraphed cell     | Leave the marked radius           |
| Radial burst      | Radius around the boss                    | Retreat beyond the radius         |
| Spiral barrage    | Ring with an inner safe pocket            | Move inside the ring or beyond it |
| Laser line        | Full row and column through a marked cell | Change both row and column        |
| Leap slam         | Mark, relocate, then strike               | Leave the landing radius          |
| Ground stomp      | Delayed local strike                      | Leave the marked radius           |
| Charge lane       | Mark a cross lane and relocate            | Change both row and column        |
| Rock wave         | Cross-shaped ground wave                  | Step off both marked axes         |
| Projectile rain   | Delayed area bombardment                  | Leave the marked radius           |

Targeted attacks snapshot Isaac's cell when the intent is rolled. They do not retarget during the enemy turn. The intent panel displays damage, target coordinate, and radius. A successful dodge still emits the pattern animation and a combat log entry so the result is visible.

## First-run boss profiles

Every boss has three HP phases: phase 1 above 66%, phase 2 from 34% through 66%, and phase 3 at 33% or below. Each phase composes two instructions.

| Boss          | Early identity               | Mid-fight escalation        | Desperate phase                  |
| ------------- | ---------------------------- | --------------------------- | -------------------------------- |
| Monstro       | spread + radial burst        | leap slam, stomp            | stronger leap + spiral ring      |
| Duke of Flies | summon/orbital guard + burst | larger swarm + spiral       | spiral + projectile rain         |
| Gurdy         | spread + summons             | rock wave + spread          | rain + spiral                    |
| Mega Fatty    | leap + radial impact         | stomp/rain or summon/burst  | heavy leap + wide rain           |
| The Cage      | predictive leap + rock wave  | spiral or charge/laser      | charge + tight spiral            |
| Mom           | stomp/rock or summon/laser   | charge/rain or stomp/summon | heavy stomp/laser or spiral/rain |

New bosses should first reuse these primitives. Add a new enum/resolver only when no existing spatial rule can express the original attack.

## Six-floor pressure curve

Catalog stats define enemy identity. `FLOOR_DIFFICULTY_CURVE` applies the floor's pressure after the catalog lookup, including encounter density.

| Floor       |    HP | Attack | Armor | Move/range | Normal encounter capacity | Boss support cap |
| ----------- | ----: | -----: | ----: | ---------- | ------------------------: | ---------------: |
| Basement I  | ×0.92 |  ×0.78 |    +0 | +0/+0      |                   50%–72% |                0 |
| Basement II | ×1.00 |  ×0.86 |    +0 | +0/+0      |                   55%–82% |                0 |
| Caves I     | ×1.10 |  ×0.94 |    +0 | +0/+0      |                   60%–90% |                1 |
| Caves II    | ×1.22 |  ×1.02 |    +1 | +0/+0      |                   65%–95% |                1 |
| Depths I    | ×1.36 |  ×1.11 |    +1 | +1/+1      |                  72%–100% |                2 |
| Depths II   | ×1.52 |  ×1.20 |    +2 | +1/+1      |                  78%–100% |                2 |

The first two floors deliberately stay below catalog attack values and do not add boss support. Caves introduces support and armor; Depths reaches full room density and improves enemy mobility/range. This creates distinct steps instead of hiding all difficulty in boss HP.

## Bomb falloff

A combat bomb still occupies a 3×3 blast, but every covered footprint cell has its own damage:

```text
15  20  15
20  30  20
15  20  15
```

Large enemies can be struck by multiple covered cells. Armor is resolved independently per occupied cell, matching the existing multi-cell bomb rule. The animation shows total raw damage and covered-cell count rather than the obsolete `50 × cells` label.
