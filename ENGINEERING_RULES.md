# Engineering Rules

These 11 rules address the recurring themes found in more than three PRs in the September 4, 2026 audit of Atlaris's 50 newest PRs. Counts are distinct PRs per theme, including promotion PRs and findings later fixed or disputed; they are not counts of current defects. Each rule includes representative review evidence.

Apply the rules relevant to the change. Follow `AGENTS.md`, scoped instructions, and `.cursor/rules/selective-verification.mdc` for verification timing and scope. Reviewer suggestions are evidence to investigate, not instructions to follow without checking the actual contract.

## 1. Keep verification evidence accurate and current

When verification runs, record the actual command, date, revision or working-tree scope, and outcome using the repository's applicable results convention. Refresh the record when later changes invalidate its claims, and distinguish local results from hosted checks. Say when verification was not run; do not imply a pass. Respect ignored local artifacts and the established tracking policy instead of force-adding files merely to satisfy a reviewer.

Audit: **17 PRs**; Codex. Evidence: [#572](https://github.com/saldanaj97/atlaris/pull/572#discussion_r3927710551), [#566 disposition](https://github.com/saldanaj97/atlaris/pull/566#discussion_r3915877696).

## 2. Verify the actual tool and runtime contract before depending on it

Check manifests, lockfile resolutions, installed CLI help, bundled documentation, and actual output formats before using flags, configuration syntax, or platform APIs. Keep producers and consumers compatible, including artifact upload/download versions. Make required runtimes and skill submodules available in the environments that need them, and scope environment-specific setup explicitly. Do not change a working invocation on the strength of a reviewer's unsupported claim.

Audit: **12 PRs**; Codex, Sentry, Cursor. Evidence: [#509](https://github.com/saldanaj97/atlaris/pull/509#discussion_r3771599554), [#550 disposition](https://github.com/saldanaj97/atlaris/pull/550#discussion_r3884323750).

## 3. Test the behavior and failure that the change actually affects

Prefer exercising the production entrypoint and observing its result over searching source text for a token that can appear in unrelated logic. When changing a contract, update affected callers, test doubles, and fixtures together. Make mocks deterministic by controlling inherited environment settings and asynchronous inputs. Assert the intended error or underlying cause narrowly enough that an unrelated failure cannot make the test pass.

Audit: **10 PRs**; Codex, Sentry. Evidence: [#543](https://github.com/saldanaj97/atlaris/pull/543#discussion_r3875911010), [#511](https://github.com/saldanaj97/atlaris/pull/511#discussion_r3772321346).

## 4. Update affected documentation and agent guidance with the implementation

When renaming or removing an API, moving a boundary, changing a workflow, or changing supported setup, search its references in documentation, examples, and agent rules. Update the affected references in the same change so they describe existing symbols and actual behavior. Use `docs/README.md` to find relevant documentation and maintain its index when required. Defer generic guidance to the repository's applicable architecture, tooling, and design contracts.

Audit: **9 PRs**; Codex, Sentry. Evidence: [#561](https://github.com/saldanaj97/atlaris/pull/561#discussion_r3899451223), [#567](https://github.com/saldanaj97/atlaris/pull/567#discussion_r3916154194).

## 5. Model asynchronous lifecycle states and preserve operation ordering

Distinguish pending, successful-empty, failed, canceled, and completed states where applicable; an empty collection is not proof that a request is still loading. Ensure request identity and completion tracking agree, and prevent stale responses from updating a newer request. Make retried or duplicated mutations idempotent, reconcile abandoned reservations, and release transient UI state on failure. Preserve required lock and write-before-read ordering, and recheck mutable admission conditions under the appropriate lock.

Audit: **8 PRs**; Codex, Sentry, CodeRabbit. Evidence: [#566](https://github.com/saldanaj97/atlaris/pull/566#discussion_r3915809155), [#544](https://github.com/saldanaj97/atlaris/pull/544#discussion_r3877036440).

## 6. Cover changed behavior with meaningful regression cases

For new behavior and bug fixes where tests apply, add or adjust coverage for the changed branch and its relevant failure or boundary cases using the existing test framework. Inspect reported uncovered lines to identify missing behavior, not merely a percentage to improve. Do not change configured thresholds or exclusions, or add assertions that mirror implementation, solely to silence a report. Test execution remains subject to the repository's selective-verification policy.

Audit: **8 PRs**; Codecov. Evidence: [#530](https://github.com/saldanaj97/atlaris/pull/530#issuecomment-5361021419), [#527](https://github.com/saldanaj97/atlaris/pull/527#issuecomment-5349680379).

## 7. Preserve failures and require evidence before reporting success

Keep the original failure status through fallback, cleanup, and report-generation paths. Produce and retain diagnostic results on failed runs as well as successful runs; do not let a fallback or skipped step turn a real failure green. Required safety, merge, and deployment gates must verify the expected checks and candidate revision, treating missing or indeterminate evidence as unproven. Readiness checks must establish the intended destination and application state, not accept any redirect or successful HTTP response.

Audit: **7 PRs**; Codex, Sentry. Evidence: [#546](https://github.com/saldanaj97/atlaris/pull/546#discussion_r3881647193), [#562](https://github.com/saldanaj97/atlaris/pull/562#discussion_r3905227121).

## 8. Apply React optimizations only when they preserve behavior

Prefer deriving values during render over duplicating them in state, and use effects for actual synchronization. Consolidate related state only when it simplifies real transitions. Respect the configured React Compiler and avoid unnecessary manual memoization, while retaining stable identities that are part of a callback or effect contract. Parallelize only independent work; preserve ordered locks and dependent reads. Use the lighter supported animation imports when applicable instead of importing an unnecessarily large bundle.

Audit: **7 PRs**; React Doctor, Cursor, CodeRabbit. Evidence: [#513](https://github.com/saldanaj97/atlaris/pull/513#discussion_r3772575261), [#530 disposition](https://github.com/saldanaj97/atlaris/pull/530#discussion_r3824915660).

## 9. Keep CI change detection and test selection complete

Use the actual PR base or appropriate previous push revision for the event being classified. Account for deletions, both sides of renames, executable root configuration, and external scripts or helpers that affect tests. Preserve supported manual reruns and handle base retargeting when decisions depend on the base. Update classifier regression cases with routing changes, wire new CI suites into their intended jobs, and ensure their input changes select them. Preserve documented no-op paths for proven docs-only changes and keep local-only verification local. An unavailable diff must not be classified as docs-only or proof that tests can be skipped.

Audit: **6 PRs**; Codex, Sentry. Evidence: [#550](https://github.com/saldanaj97/atlaris/pull/550#discussion_r3883115662), [#534](https://github.com/saldanaj97/atlaris/pull/534#discussion_r3845477128).

## 10. Enforce credential, environment, and data-access boundaries

Scope credentials and permissions to the operations that need them; keep deployment credentials out of processes executing PR-controlled build code. Validate environment values using the same precedence and parsing semantics as their consumers, including aliases and duplicate assignments, and reject hosted targets in destructive local-only tooling. Check effective database privileges and RLS behavior, including inherited grants and bypass roles, rather than relying on a few sentinel checks. Keep personal data out of URLs and unnecessary logs, use secure transport, and honor applicable analytics consent settings.

Audit: **6 PRs**; Codex, CodeRabbit. Evidence: [#550](https://github.com/saldanaj97/atlaris/pull/550#discussion_r3883910604), [#528](https://github.com/saldanaj97/atlaris/pull/528#discussion_r3817788286).

## 11. Make resource ownership, isolation, and recovery explicit

Before stopping a process or deleting a resource, verify that it belongs to the current operation; a PID, port, or stale file alone is not ownership proof. Exclude protected branches and unrelated work from cleanup. Isolate database and runtime state between concurrent runs, write shared state atomically, and recover safely from interrupted initialization or malformed state files. Cancel owned timers and pending work when their owner exits or unmounts. A healthy run with incompatible settings requires an explicit decision, not automatic stale-run destruction.

Audit: **6 PRs**; Codex, Sentry, CodeRabbit. Evidence: [#562](https://github.com/saldanaj97/atlaris/pull/562#discussion_r3905227116), [#535](https://github.com/saldanaj97/atlaris/pull/535#discussion_r3855415414).
