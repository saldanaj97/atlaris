# 310 - Biome Hooks and CI Alignment

## Acceptance Criteria

- [x] Repository uses one primary Git hook manager for local developer hooks.
- [x] Duplicate or inactive hook configuration is either removed or explicitly documented as intentionally inactive.
- [x] Biome CI usage matches Biome's current CI guidance without weakening existing type checking or migration drift checks.
- [x] Local pre-commit behavior formats and fixes only intended staged files and does not accidentally stage unrelated unstaged hunks.
- [x] Secret scanning remains enforced locally where it is currently expected and is not silently dropped.
- [x] CI path filters include hook and Biome configuration files so quality workflow changes trigger validation.
- [x] Developer command documentation reflects the final supported hook and Biome command surface.
- [x] Validation proves hook commands and CI commands are read-only or write-mode exactly where intended.

## Plan

- [x] Phase 0 - Reconfirm current hook and CI state
- [x] Phase 1 - Decide and document the single hook-manager strategy
- [x] Phase 2 - Add Biome CI command surface and wire CI safely
- [x] Phase 3 - Harden pre-commit staged-file behavior
- [x] Phase 4 - Update docs and remove stale configuration
- [x] Phase 5 - Validate locally without relying on real commits or pushes
- [x] Phase 6 - Review changed files and capture implementation notes

## Review

- Husky is now the only repo-supported local hook manager.
- `.pre-commit-config.yaml` was removed because it duplicated the active Husky ggshield hook and was not actually used by Git with the current `core.hooksPath`.
- `.husky/pre-commit` now delegates staged-file handling to `lint-staged`, which avoids the old blanket `git add` behavior on partially staged files.
- `check:lint:ci` was added for CI use, but PR CI falls back to `pnpm check:lint` for tooling-only changes because Biome ignores config-only files outside its include set.
- PR CI now runs Biome CI on source changes and preserves separate `pnpm check:type` and migration drift checks.
- Validation: `sh -n .husky/pre-commit`, `pnpm exec lint-staged --debug --allow-empty`, `node` package.json parse, YAML parse for both workflow files, and `git diff --check` passed.
