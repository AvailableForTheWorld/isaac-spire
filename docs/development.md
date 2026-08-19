# Development guide

## Toolchain

- Node `24.19.0` through fnm (`.node-version`).
- pnpm `11.22.0` (`packageManager`).
- TypeScript strict mode across all workspaces.
- ESLint flat config, Prettier, EditorConfig, Husky, and lint-staged.
- Sass for authored component styles and UnoCSS for small compositional utilities.

## Commands

```powershell
pnpm dev          # game package build + API/web watch mode
pnpm lint         # all workspaces
pnpm typecheck    # all TypeScript projects
pnpm test         # game, API, and web tests
pnpm build        # production builds
pnpm check        # lint + typecheck + test + build
pnpm format       # format tracked source/config/docs
pnpm format:check
```

The pre-commit hook calls the repository-local `lint-staged` binary directly, so Git Bash and editor Git integrations do not need a global pnpm entry in their PATH. It runs ESLint fixes and Prettier only for staged files. CI should run `pnpm check` and `pnpm format:check`.

## Adding content

1. Add the definition to a focused content pack.
2. Use stable IDs; persisted snapshots store IDs.
3. Register the pack through `createContentCatalog`.
4. Add translations by ID rather than embedding UI text in combat rules.
5. Add deterministic tests for pool eligibility, unlock rules, and synergy math.
6. Update `CHANGELOG.md`.

## Adding enemy behavior

Represent telegraphed behavior as intent/action data. Add a strategy in `combat/enemy-ai.ts` or a registered behavior strategy; do not branch in React or Phaser. Movement/range algorithms belong in `combat/grid.ts`. Rendering for a new animation event belongs in `BattleScene`.

## Save compatibility

Never rewrite old save objects ad hoc in UI code. Add an idempotent step in `state/migrations.ts`, keep the compatibility barrel export, and test a snapshot missing the new field.

## Change log policy

Every behavior, content, persistence, public API, dependency, or architecture commit adds a concise bullet to `CHANGELOG.md` under `Unreleased`. Releases move those bullets under a dated version. Pure typo-only commits may be grouped, but should still be represented when they change player-visible text.
