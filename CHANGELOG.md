# Changelog

This file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Every future pull request or commit that changes runtime behavior, content, persistence, tooling, or public APIs must update the `Unreleased` section.

## Unreleased — architecture and persistence refactor

### Added

- Bounded domain modules for player/content, routes, combat, and run persistence types.
- O(1) content registries and composable content packs for future items, enemies, floors, expansions, and PvP-only rules.
- Dedicated grid/pathfinding, enemy-AI, combat-event, and save-migration modules in `packages/game`.
- SQLite run repository using WAL, indexes, transactional profile/run updates, and gzip-compressed snapshot BLOBs.
- Automatic one-time import of the legacy JSON store into SQLite; the source JSON is replaced by a recoverable `.migrated.json.gz` backup.
- Configurable completed-run and stale-active retention (`ISAAC_SPIRE_HISTORY_LIMIT=50`, `ISAAC_SPIRE_ACTIVE_RUN_LIMIT=5`), storage statistics, deletion, and explicit compaction APIs.
- Feature-oriented React folders, a game-session controller hook, shared HUD/dialog components, and lightweight API/local-run adapters.
- Route, combat, reward, and result page lazy loading; React, i18n, and Phaser are emitted as independent chunks.
- Sass, UnoCSS, ESLint, Prettier, Husky, lint-staged, EditorConfig, reduced-motion support, and response compression.
- Architecture, storage, and development documentation.
- A package-manager-independent Husky hook that invokes the repository-local `lint-staged` binary in Git Bash and editor Git integrations, with LF hook line endings pinned on Windows.
- Exhaustive reward profiles for normal clears, special rooms, deals, future rare rooms, and every current card/item pool assignment.
- A blocking room-drop chest that appears immediately after the final enemy dies and must be confirmed before card selection.

### Changed

- `App.tsx` is now a five-line composition entry instead of the application controller and every view living in one file.
- `GET /api/runs` returns lightweight `RunSummary` records; `GET /api/runs/active/latest` loads only the resumable snapshot.
- Battle/grid helpers preserve the original root exports while living in cohesive modules.
- Styling moved from a flat CSS entry to Sass while retaining the existing visual language.
- In-run surfaces prevent text selection and text carets while preserving keyboard focus and editable-control behavior.
- Room item/card rolls now use room-specific quality curves instead of one global rarity table.
- Reward pools, contexts, qualities, strengths, and result kinds now use semantic enums while preserving their existing serialized values.
- All shared categorical discriminants—including card type/target, item and room kind, enemy intent/behavior, animation event, room shape, run phase, choice/action/resource/upgrade, deal type, and save status—now come from one stable domain-enum module; frontend-only pile/card modes use local UI enums.
- React, Phaser, NestJS, SQLite queries, content definitions, translations, and tests now consume enum members instead of repeating wire strings.
- Enemy stat panels now pass pointer input through to the tactical grid unless an enemy-targeting card is actively choosing a valid target.
- Legacy combat saves missing the bounded animation-event buffer now hydrate with safe empty defaults.
- Every room reward can now be left behind without taking a card, item, or resource; doing so preserves the held active item and its deck card.
- SQLite run ordering uses insertion order as a deterministic tie-breaker when queued saves share the same millisecond timestamp.

### Performance

- Animation and combat log buffers remain bounded, preventing snapshots from retaining an unlimited event history.
- BFS pathfinding uses an index cursor rather than repeated `Array.shift()`, avoiding needless O(n) queue moves.
- SQLite upserts replace full-file read/parse/rewrite cycles, and compressed snapshots reduce disk and API payload pressure.
- Phaser and phase-specific React views are loaded only when needed.

## 2026-08-19 — `063cc8f` — map and room UI update

- Randomized route node positions, Bezier route ink, secret-room branches, narrower route presentation, and per-room node shapes.
- Variable-size standard, wide, tall, large, and L-shaped combat rooms with random full-room deployment and enemy placement.
- Lower early-floor large-room frequency, scalable encounter capacity, large-room permanent rewards, and floor-entry multi-choice rewards.
- Combat bombs, locked shops/treasure rooms, secret-wall searches, reward reveals, room-clear transitions, and active-item replacement/discard confirmations.
- Clearer discard-to-enemy-turn transition and slower damage calculation presentation.
- Transparent enemy panels outside targeting, duplicate-enemy identity markers, scene target highlighting, and top-edge-safe combat labels.

## 2026-08-19 — `02b3708` — UI and combat logic update

- Expanded enemy intent sequences, vision, wandering, diagonal jump/contact behavior, boss double actions, summons, preparation, and reactions.
- Full-room combat animation coverage for damage, armor, shield, blood, cards, turn changes, defeat, and rewards.
- Fixed-width card layout, Isaac-style heart HUD, individual 30-HP containers, visible shield/armor, and charge cells.
- Attack targeting guidance, cancelable aiming, optional fusion panel, geometric one-shot attack fusion, status modifiers, and target selection among multiple valid enemies.
- React confirmation panels replaced native active-item prompts.

## 2026-08-18 — `09bc3d5` — grid playing

- Converted combat to a tactical square grid with vitality-powered cardinal movement, range checks, enemy movement, and variable footprints.
- Added player deployment selection, straight-line attack targeting with Spoon Bender exceptions, draw/discard pile inspection, and active/passive item-card lifecycle rules.
- Added reusable passive item cards, exhausted active items, The D6 reroll behavior, and attack-fusion foundations.

## 2026-08-18 — `6804c65` — initial vertical slice

- Initialized the pnpm monorepo with React/Vite/Phaser frontend, NestJS backend, and framework-independent game package.
- Added the six-floor Mom first run, branching room route, seeded map generation, combat/deck loop, rewards, items, unlocks, and profile/run persistence.
- Added Chinese-default i18n, English switching, Phaser combat rendering, API tests, engine tests, Node 24 pinning, and project documentation.
