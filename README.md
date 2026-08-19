# Below — an Isaac deckbuilder

`Below` is a playable six-floor deckbuilding roguelike vertical slice. It combines an Isaac-inspired room and item structure with a branching route map and turn-based card combat. The first run travels through Basement I/II, Caves I/II, and Depths I/II before the Mom's Leg finale.

This is a fan-made gameplay prototype and is not affiliated with Edmund McMillen, Nicalis, or Mega Crit.

## Stack

- `apps/web`: feature-oriented React 19, Vite, Sass/UnoCSS, and Phaser 4. React renders navigation, cards, and accessible controls; Phaser is an isolated animated combat renderer.
- `apps/api`: NestJS 11 with a transactional, gzip-compressed SQLite repository for active runs and unlock progression.
- `packages/game`: framework-independent domain modules, content registries, seeded state machine, grid/AI algorithms, and save migrations.
- pnpm workspaces coordinate the monorepo.

## Run it

Requirements: Node.js 24 LTS and pnpm 11. The repository pins Node `24.19.0` in `.node-version` for fnm and pnpm `11.22.0` in `package.json`.

```powershell
fnm install
fnm use
node --version
npx --yes get-pnpm 11.22.0
pnpm install
pnpm dev
```

The Node version check should print `v24.19.0`. The pnpm installer is self-contained, so it remains available when fnm switches Node versions. Open a new terminal after its first installation, then confirm with `pnpm --version` (expected: `11.22.0`).

To switch Node automatically whenever you enter the repository, initialize fnm in your PowerShell profile with:

```powershell
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
```

Open `http://localhost:5173`. The API listens on `http://localhost:3001/api`.

Use `pnpm check` to run ESLint, TypeScript checks, rule/API tests, and production builds. See [architecture](docs/architecture.md), [reward balance and card pools](docs/reward-balance.md), [storage](docs/storage.md), [development](docs/development.md), and the [change log](CHANGELOG.md).

## First-run rules

- Isaac starts with three 30-HP red-heart containers, 3 armor, 10 shield, five vitality, seven-card draw, one bomb, one key, five coins, and The D6.
- A turn ends immediately when requested, but hands above five cards must first be discarded down to five. Active skill cards stay equipped and consume their original item's round-based charge.
- Fire rate is a tear-echo accumulator. At `1.25`, every fourth attack card creates a free repeat hit; at `1.5`, every second attack does so. This preserves the five-vitality economy while making tears-up items meaningful.
- Enemies telegraph attack, shield, curse, recovery, preparation, or idle intents. Prepared champion attacks deal double damage on the next action.
- Damage consumes shield, then soul/black hearts, then red hearts. When a black heart empties, normal enemies die and elites/bosses take 100 damage.
- Each map contains three connected branches. Every branch has one Shop, Treasure Room, Secret Room, and Super Secret Room. Secret rooms are optional bomb-gated detours, so running out of bombs never blocks progress.
- Bosses award a boss-pool item, then independently roll the cumulative Devil/Angel gate. The two rooms are mutually exclusive. Skipping a Devil room builds Angel favor for later floors.

## Items and progression

Active items replace Isaac's current active item and its persistent skill card. Passive items can modify damage, multiplier, armor, starting shield, heart size, vitality, draw, fire rate, critical chance, shop discounts, room visibility, damage caps, and attack form (`basic`, `knife`, `brimstone`, or `tech-x`).

Unlock events included in the first slice:

- hold 15 coins: Steam Sale;
- open both secret-room types on one floor: Blue Map;
- clear a floor without red-heart damage: Holy Mantle;
- beat an elite without taking damage: Tech X;
- skip two Devil rooms: Sacred Heart;
- defeat Mom's Leg: Brimstone and Mom's Knife.

## Persistence API

The API stores one compressed latest snapshot per run in `apps/api/data/runtime/isaac-spire.sqlite`. An existing JSON store is imported transactionally and replaced by a compressed recoverable backup. Set `ISAAC_SPIRE_DB_FILE`, `ISAAC_SPIRE_DATA_FILE`, `ISAAC_SPIRE_HISTORY_LIMIT`, and `ISAAC_SPIRE_ACTIVE_RUN_LIMIT` to customize it.

- `GET /api/health`
- `GET /api/profile`
- `GET /api/runs`
- `GET /api/runs/active/latest`
- `GET /api/runs/:id`
- `POST /api/runs`
- `PUT /api/runs/:id`
- `DELETE /api/runs/:id`
- `GET /api/maintenance/storage`
- `POST /api/maintenance/storage/compact`

The browser also keeps the latest snapshot in local storage, so a run remains resumable when the API is temporarily unavailable.
