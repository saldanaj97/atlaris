# Ditch Biome for Oxlint and Prettier

## Summary

Replace Biome with local project tooling: Oxlint owns linting, Prettier owns formatting, and `prettier-plugin-tailwindcss` owns Tailwind class sorting. Keep the migration explicit across package scripts, CI, hooks, editor settings, docs, and validation.

## Implementation

1. Remove `@biomejs/biome`; add exact dev dependencies `oxlint@1.62.0`, `prettier@3.8.3`, and `prettier-plugin-tailwindcss@0.8.0`.
2. Delete `biome.json`; add `.oxlintrc.json`, `prettier.config.mjs`, and `.prettierignore`.
3. Replace Biome package scripts with Oxlint and Prettier scripts, including read-only `check:full`.
4. Replace `scripts/biome-changed.sh` with `scripts/lint-changed.sh` for changed-file lint and format checks.
5. Update Husky, lint-staged, PR CI, VS Code settings, docs, and local AGENTS guidance.
6. Run the mechanical Prettier baseline, Oxlint autofix, then read-only validation gates.

## Validation

- `pnpm check:format`
- `pnpm check:lint:fix`
- `pnpm check:lint`
- `pnpm check:type`
- `pnpm check:full`
- `pnpm test:changed`
- `rg -n "biome|Biome|@biomejs"` final sweep
