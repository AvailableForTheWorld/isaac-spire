# Architecture

## Goals

The codebase is organized around change frequency. Content changes often; battle rules change less often; storage and rendering technology should be replaceable without changing either. The first-run game remains a deterministic vertical slice, while later acts, hundreds of synergies, richer animation, and authoritative multiplayer can be added behind stable boundaries.

## Dependency direction

```text
apps/web ─────┐
              ├──> packages/game (pure domain + deterministic commands)
apps/api ─────┘

apps/web: React feature views -> session controller -> browser/API adapters
apps/api: HTTP controllers -> StoreService -> RunRepository port -> SQLite adapter
```

`packages/game` must never import React, Phaser, NestJS, filesystem, database, or browser APIs. Both applications depend inward on the game domain.

## Shared game package

- `domain/enums.ts`: the single source of truth for persisted/API discriminants, including cards, targets, items, rooms, intents, animation events, choices, phases, and run status.
- `domain/player.ts`: player, card, item, stat, and fusion contracts.
- `domain/map.ts`: room, route node, connection, and floor-map contracts.
- `domain/combat.ts`: enemies, intentions, grid rooms, combat state, and animation-domain events.
- `domain/run.ts`: run aggregate, choices, progression profile, persisted records, and summaries.
- `domain/achievement.ts`: typed achievement conditions, progress, events, notices, and platform port.
- `content/registry.ts`: validated O(1) key lookup and bulk registration.
- `content/catalog.ts`: composes the built-in pack and future expansion/mod packs.
- `combat/grid.ts`: collision, footprint math, cardinal BFS, visibility, and range strategies.
- `combat/enemy-ai.ts`: behavior strategy selection and deterministic intent state machines.
- `combat/events.ts`: bounded combat log and animation event buffers.
- `rewards/room-rewards.ts`: exhaustive room reward budgets, quality curves, and selection metadata.
- `state/migrations.ts`: pure, idempotent save-schema migrations.
- `achievements/catalog.ts`: declarative bilingual achievement and item-unlock definitions.
- `achievements/tracker.ts`: indexed event reducer, condition evaluator, idempotent profile merge, and platform synchronization diff.
- `engine.ts`: compatibility facade and application commands. New cohesive algorithms belong in a domain module, not in this facade.

### Content expansion

A future content package implements `GameContentPack`:

```ts
const repentancePack: GameContentPack = {
  id: 'isaac-spire.repentance',
  version: '1.0.0',
  cards: [...],
  items: [...],
  enemies: [...],
  floors: [...],
};

const catalog = createContentCatalog([BUILTIN_CONTENT_PACK, repentancePack]);
```

Registries reject duplicate keys during startup. Runtime lookup is `Map`-backed O(1), while pool queries are isolated from the battle engine. When content reaches hundreds of definitions, split packs by act/pool and load only the active ruleset.

### Algorithms and bounded state

- Cardinal movement uses BFS: O(V + E) for a room graph. A cursor queue avoids repeated array shifting.
- Occupancy and visited cells use `Set<string>` for average O(1) membership tests.
- Content IDs use `Map` registries for average O(1) lookup.
- Achievement conditions use a metric-to-definition reverse `Map`, so an event evaluates only affected achievements.
- Random pools use deterministic seeded selection; visual route jitter has a separate presentation seed.
- Combat logs and animation events are capped at 8 and 32 entries. These are presentation buffers, not permanent run history.
- Run commands clone the aggregate, apply one transition, and return a new snapshot. This command/state-machine boundary is the future validation point for authoritative PvP input.

## Frontend

`App.tsx` only mounts `GameApplication`. `GameApplication` selects a phase view. `useGameSession` owns persistence and error handling; reward confirmation is an explicit persisted game-state transition rather than a UI timer. Feature views receive a snapshot plus a `RunCommand` dispatcher and do not call storage directly.

```text
features/
  game/       phase composition
  run/        session controller and persistence adapters
  home/       start/resume screen
  map/        route presentation
  combat/     combat page, cards, fusion, targeting, timings
  rewards/    room/floor choices and blocking chest confirmation
  result/     victory/defeat
  stats/      run inspection
components/game/  shared HUD and dialogs
phaser/           imperative battle renderer adapter
shared/api/       HTTP transport
```

React owns accessible controls and state composition. Phaser consumes the current snapshot and animation events; it does not own game rules. This keeps future sprite/animation work independent from combat correctness.

The home achievement compendium reads the persisted profile, while in-run toasts and the result view read bounded achievement notices. See [achievement system](achievement-system.md) for progression rules and the future Steam adapter contract.

## Backend

The backend uses ports and adapters:

- Controllers translate HTTP to application calls.
- `StoreService` validates snapshots and updates meta progression.
- `RunRepository` defines persistence operations.
- `SqliteRunRepository` implements transactional SQLite storage and compression.

Replacing SQLite with Postgres for hosted PvP requires a new repository adapter, not controller or game-domain changes.

## Multiplayer evolution

Do not synchronize entire client snapshots between players. Add a `packages/protocol` package containing versioned commands and server events. The server should own the canonical `RunState`, validate a command against the current phase/turn/version, apply the same deterministic game command, and broadcast the resulting event/version. Use optimistic UI only for reversible local presentation. Matchmaking, lobby, presence, and reconnect state belong outside `packages/game`.

## Rules for future code

1. Content definitions register data; they do not import UI or persistence.
2. New combat algorithms enter `combat/*`; `engine.ts` remains a facade.
3. A feature may import shared/domain code, but features do not import one another's internal components.
4. Persist IDs and mutable state only—never copy complete item/enemy definitions into a run snapshot.
5. Every new save shape gets an idempotent migration and a compatibility test.
6. Every behavior change updates `CHANGELOG.md` and adds a focused domain test.
7. Every categorical discriminator (`type`, `kind`, `target`, `phase`, `status`, `roomKind`, and similar fields) uses the enum from `domain/enums.ts`; do not repeat wire literals in content, engine, UI, API, or tests.
8. Enum values are wire data. Preserve their serialized value for save/API compatibility; add a migration before changing or removing one.
