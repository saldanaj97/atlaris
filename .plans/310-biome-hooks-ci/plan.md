# Plan: Biome Hooks and CI Alignment

## Summary

Align Atlaris with Biome's current Git hook and CI guidance without loosening existing quality gates. The likely end state is Husky-only local hooks, `biome ci` for CI lint/format/import checks, preserved `pnpm check:type`, preserved Drizzle migration drift checking, and removal of the inactive `pre-commit` duplicate unless new evidence shows it is still needed.

This is a workflow-hardening task, not an app-code task. The blast radius should stay inside package scripts, hook files, CI workflow files, docs, and possibly deletion of stale hook config.

## Current Findings

- `package.json` has `prepare: "husky || true"`, so Husky is the installed Node-native hook path.
- `git config --get core.hooksPath` reports `.husky/_`, so checked-in Husky hooks are active.
- `.husky/pre-commit` runs `pnpm exec biome check --write --staged --no-errors-on-unmatched`, then re-adds originally staged files, then runs `ggshield secret scan pre-commit` when `ggshield` exists.
- `.husky/pre-push` runs `pnpm check:full`, which currently means `pnpm check:lint` plus `pnpm check:type`.
- `.pre-commit-config.yaml` only configures `ggshield`; it duplicates Husky's ggshield behavior but is not active while `core.hooksPath` points at `.husky/_`.
- `.git/hooks/pre-commit` contains generated `pre-commit` glue, but Git ignores it with the current hook path. That is local machine residue, not repo behavior.
- `.github/workflows/ci-pr.yml` runs `pnpm check:full`, which uses `biome check`, not `biome ci`.
- CI path filters currently include `src`, `tests`, `vitest.config.ts`, `tsconfig.json`, `package.json`, `pnpm-lock.yaml`, and `drizzle.config.ts`; they do not include `biome.json`, `.husky/**`, or `.pre-commit-config.yaml`.

## Non-Goals

- Do not change application behavior.
- Do not broaden lint scope beyond the repo's existing `biome.json` includes unless explicitly approved.
- Do not remove `ggshield` protection without a replacement.
- Do not weaken `pnpm check:type`, migration drift checks, or existing test expectations.
- Do not introduce another hook manager unless there is a concrete need Husky cannot handle.

## Step 0.0 - Reconfirm Active State Before Editing

Commands:

```bash
git status --short
git config --get core.hooksPath
sed -n '1,160p' package.json
sed -n '1,160p' .husky/pre-commit
sed -n '1,120p' .husky/pre-push
sed -n '1,120p' .pre-commit-config.yaml
sed -n '1,130p' .github/workflows/ci-pr.yml
sed -n '1,80p' .github/workflows/ci-trunk.yml
```

Checks:

- Confirm no unrelated user edits in files this task will touch.
- Confirm `pre-commit` config still only duplicates `ggshield`.
- Confirm no other CI workflow already calls `biome ci`.

## Step 1.0 - Choose One Hook Manager

Recommendation:

- Keep Husky.
- Remove `.pre-commit-config.yaml` if it remains duplicate-only.

Reasoning:

- This is a pnpm/Node project, and Husky is already in `devDependencies`.
- Husky is already activated by `prepare` and `core.hooksPath`.
- `pre-commit` adds Python tooling, a second install path, and currently no unique repo value.
- Duplicate hook managers create false confidence: one config can exist while the other actually runs.

Implementation target after approval:

- Delete `.pre-commit-config.yaml`, or if the user wants to keep it for personal use, document that repo-supported hooks are Husky-only and `.pre-commit-config.yaml` is not part of supported workflow.

Validation:

```bash
git config --get core.hooksPath
test "$(git config --get core.hooksPath)" = ".husky/_"
```

## Step 2.0 - Add Biome CI Command Surface

Recommended script changes:

```json
"check:lint": "biome check --max-diagnostics=1000",
"check:lint:ci": "biome ci --max-diagnostics=1000",
"check:lint:fix": "biome check --write --max-diagnostics=1000"
```

Important constraint:

- Do not replace `check:full` with `biome ci` directly unless we confirm local dev UX stays right. `check:full` is used by docs and pre-push; local `biome check` is acceptable there. CI should call the CI-specific script.

Expected CI shape:

```bash
pnpm check:lint:ci
pnpm check:type
```

Keep type checking as a separate command. Biome does not replace `tsgo --noEmit`.

## Step 3.0 - Wire CI Without Losing Existing Gates

Change `.github/workflows/ci-pr.yml` only if it is the active lint/type workflow for PRs.

Target:

- Keep install, migration drift, and dependency setup unchanged.
- Replace `Run full lint and type check` with either one step:

```bash
pnpm check:lint:ci
pnpm check:type
```

- Or two named steps for clearer failure attribution:

```yaml
- name: Run Biome CI
  run: pnpm check:lint:ci
- name: Run type check
  run: pnpm check:type
```

Prefer two named steps. It makes CI failures less muddy.

Update path filters:

```yaml
- 'biome.json'
- '.husky/**'
- '.pre-commit-config.yaml'
- 'scripts/biome-changed.sh'
- 'docs/development/commands.md'
```

Evaluate `.github/workflows/ci-trunk.yml` separately:

- It currently gates integration and e2e work, not lint/type.
- Do not stuff lint/type into trunk unless repo policy says trunk should rerun it. If PR CI already protects merges, keep this task narrow.
- If branch protection requires trunk lint/type too, add a dedicated lint/type job there using the same `check:lint:ci` plus `check:type` split.

## Step 4.0 - Harden Pre-Commit Staged-File Behavior

Problem:

- Current hook records staged file names, runs `biome check --write --staged`, then runs `git add` on every originally staged file.
- If a file is partially staged, re-adding the entire file can stage unrelated unstaged hunks.
- This is exactly the kind of hook behavior that causes silent scope creep.

Safer options:

Option A - Add `lint-staged`

- Use `lint-staged` to hide unstaged changes, run Biome on staged paths, and restage only transformed staged content.
- Cost: one more dev dependency.
- Benefit: common, well-understood staged-file safety.

Option B - Add `git-format-staged`

- Use `git-format-staged` if the priority is surgical staged-content formatting.
- Cost: another tool and likely less team familiarity.
- Benefit: strongest partial-staging protection.

Option C - Keep current approach, document partial-staging risk

- Lowest change count.
- Weakest engineering answer.
- Not recommended. It preserves a known footgun.

Recommended path:

- Use `lint-staged` only if we accept one small dev dependency.
- Configure it to run Biome on staged TS/TSX files matching current `biome.json` scope.
- Keep `ggshield` in Husky after Biome/lint-staged.

Potential config:

```json
"lint-staged": {
  "*.{ts,tsx}": "biome check --write --no-errors-on-unmatched"
}
```

Then `.husky/pre-commit` becomes:

```sh
#!/bin/sh
set -e

echo "Running Biome on staged files..."
pnpm exec lint-staged

echo "Running ggshield secret scan..."
if ! command -v ggshield >/dev/null 2>&1; then
  echo "ggshield not installed, skipping secret scan"
else
  ggshield secret scan pre-commit
fi
```

Before implementing, verify whether `lint-staged` passes filenames to Biome in a way that respects `biome.json` includes and avoids unknown-file failures. If not, keep `--no-errors-on-unmatched` or use a tiny shell wrapper.

## Step 5.0 - Update Documentation

Update `docs/development/commands.md`:

- Add `pnpm check:lint:ci`.
- Clarify `pnpm check:lint` is local read-only Biome check.
- Clarify `pnpm check:lint:fix` writes safe fixes.
- Clarify supported local Git hooks are Husky-only.

Optional README update:

- Only add `pnpm check:lint:ci` if README lists every quality command. Otherwise keep README simple.

Do not over-document internals. Docs should tell contributors what to run and what hooks exist.

## Step 6.0 - Validation Steps

Run fast static validation first:

```bash
pnpm check:lint:ci
pnpm check:type
```

Run existing baseline:

```bash
pnpm check:full
```

Validate hook scripts without making a real commit:

```bash
sh -n .husky/pre-commit
sh -n .husky/pre-push
HUSKY=0 pnpm exec biome ci --max-diagnostics=1000
```

If `lint-staged` is introduced:

```bash
pnpm exec lint-staged --debug
```

Run changed-test baseline only if implementation touches executable scripts, config that impacts test selection, or test runner code:

```bash
pnpm test:changed
```

Expected outcome:

- `pnpm check:lint:ci` passes.
- `pnpm check:type` passes.
- `pnpm check:full` passes.
- Hook shell syntax passes.
- `pnpm test:changed` either passes or any existing unrelated failure is documented with exact failing specs.

## Step 7.0 - Issue Verification and Closure

No GitHub issue is attached yet.

Manual verification checklist:

- Biome docs alignment: CI uses `biome ci`.
- Hook-manager consolidation: repo supports Husky only.
- Secret scan preserved: Husky still runs ggshield when installed.
- Partial-staging risk handled: hook no longer blindly re-adds full originally staged files, or risk is explicitly accepted.
- CI path filters include Biome/hook config.
- Docs match actual commands.

## Risk Notes

- Adding `lint-staged` can change pre-commit behavior across all contributors. This is acceptable only if validated with partial staging.
- Removing `.pre-commit-config.yaml` can surprise anyone manually running `pre-commit run`. That is not a strong reason to keep it; it is a reason to document Husky as the supported path.
- `biome ci` may enforce assist actions differently than `biome check`. Run it before wiring CI so failures are caught locally.
- Existing worktree is dirty. Implementation must avoid staging or formatting unrelated files outside the approved task files.
