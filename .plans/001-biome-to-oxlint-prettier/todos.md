# Ditch Biome for Oxlint and Prettier Todos

- [x] Replace Biome dependency with local Oxlint, Prettier, and Tailwind Prettier plugin dev dependencies.
- [x] Replace Biome config with Oxlint and Prettier config files.
- [x] Update package scripts, changed-file helper, lint-staged, Husky, PR CI, and VS Code settings.
- [x] Rewrite Biome references in docs and local AGENTS guidance.
- [x] Run Prettier baseline and Oxlint autofix.
- [x] Resolve remaining Oxlint diagnostics.
- [x] Run read-only validation gates.
- [x] Run final Biome reference sweep.

## Review

Completed migration from Biome to local Oxlint and Prettier tooling.

Validation passed:

- `pnpm check:lint`
- `pnpm check:type`
- `pnpm check:full`
- `pnpm test:changed`
- Final `rg -n "biome|Biome|@biomejs"` sweep returned no remaining references outside this migration plan package.

One test-only fallout fix was required after the formatting/tooling baseline:
`tests/unit/components/AuthControls.spec.tsx` now wraps `AuthControls` in `TooltipProvider`, matching the component runtime requirement exposed by the changed-test run.
