<!-- e8e0bc53-ac6a-412e-baf1-66cc0392c4ae 1cb4748d-50e8-4979-8639-d4b8dd49a34c -->

# Phase 4 – Pacing + Orchestrator Integration

## Goal

Trim the AI‑generated plan to fit each user’s time capacity, preserving module/task order and at least one task per module, and apply this before persisting.

## Files to add/change

- Add `src/lib/ai/pacing.ts`
- Update `src/lib/ai/orchestrator.ts`
- (No schema change; UI and mappers already provide numeric `weeklyHours` and valid dates)

## Pacing module (src/lib/ai/pacing.ts)

- Inputs: `{ weeklyHours: number; skillLevel: 'beginner'|'intermediate'|'advanced'; startDate?: string|null; deadlineDate: string; }` and `modules: ParsedModule[]`.
- Capacity calculation:
  - weeks = ceil((deadlineDate − (startDate || today)) / 7 days); clamp to ≥1
  - avgTaskMinutes = 45 (beginner: +10, intermediate: +0, advanced: −10); clamp to [20, 90]
  - capacityTasks = floor((weeklyHours _ weeks _ 60) / avgTaskMinutes); clamp to ≥ number of modules (ensures ≥1 per module)
- Trimming algorithm (preserve order, stable IDs, ≥1 per module):
  - Preselect first task of each module (if any tasks present)
  - Build an ordered queue of remaining tasks across modules (module order, then task order)
  - Take remaining slots until `capacityTasks` is reached
  - Remove empty modules; keep module `title/description/estimated_minutes` intact
- Edge cases/safeguards:
  - If `deadlineDate` ≤ `startDate` or invalid, treat weeks = 1
  - If `weeklyHours` ≤ 0, set capacityTasks = number of modules (minimal viable: 1/task per module)
  - Return original modules if capacity ≥ total tasks

## Orchestrator integration (src/lib/ai/orchestrator.ts)

- Apply pacing right after parsing the provider stream and before persisting via `recordSuccess`.
- Use `context.input.weeklyHours`, `context.input.skillLevel`, `context.input.startDate`, `context.input.deadlineDate`.
- Replace `parsed.modules` with `paced.modules` passed to `recordSuccess` and returned to caller.

Essential insertion point reference:

```141:153:src/lib/ai/orchestrator.ts
    rawText = parsed.rawText;

    const durationMs = clock() - startedAt;
    timeout.cancel();

    const attempt = await recordSuccess({
      planId: context.planId,
      preparation,
      modules: parsed.modules,
      providerMetadata: providerMetadata ?? {},
      durationMs,
      extendedTimeout: timeout.didExtend,
      dbClient,
      now: nowFn,
    });
```

Planned change: compute `const paced = pacePlan(parsed.modules, context.input);` and pass `modules: paced.modules`.

## Validation and invariants

- Inputs are already normalized by `mapOnboardingToCreateInput`; add lightweight checks inside `pacing.ts` (date parsing, clamping) to avoid runtime errors.
- Maintain module/task order; ensure ≥1 task per module when tasks exist.
- Do not mutate inputs; return new arrays.

## Minimal types

- Reuse existing `ParsedModule` and `Task` shapes from the parser.
- Export: `computeCapacity(params)`, `trimModulesToCapacity(modules, capacity)`, `pacePlan(modules, params)`.

## Out of scope (later phases)

- Prompt updates for pacing context (Phase 5)
- Tests (Phase 6)
- Worker time‑budget interactions (Phase 5)

## To-dos

- [x] Create src/lib/ai/pacing.ts with exported pacing API
- [x] Implement computeCapacity using weeks and avgTaskMinutes rules
- [x] Implement trimModulesToCapacity preserving order and ≥1 per module
- [x] Integrate pacing into orchestrator before recordSuccess
- [x] Add date/number guards and clamping in pacing module
