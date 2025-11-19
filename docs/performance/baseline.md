# Baseline Latency: Pre-Generation Plan Creation

This note preserves the baseline latency for the `POST /api/v1/plans` endpoint before the asynchronous generation workflow was introduced. The measurement captures only the historical synchronous behavior (plan insert + immediate cleanup) so it can be compared against future runs that include orchestration overhead.

## Environment

- macOS (Apple Silicon)
- Node.js 20 via `pnpm`
- Local neon/Postgres running at `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Database pre-seeded with the project schema (no generation attempts recorded)

## How the baseline was captured

The `scripts/perf/measure-generation.ts` harness performs a pure plan insert loop before it invokes any generation logic. Running the script and recording the `baseline` block from the JSON output yields a faithful measurement of the pre-implementation path. The generation stage can be ignored (or aborted once the baseline block prints) because it exercises the newer async workflow.

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  pnpm tsx scripts/perf/measure-generation.ts --iterations=30
```

> Tip: If you only need the baseline numbers, you can stop the command immediately after the baseline phase finishes (once the `[measure-generation] Running generation measurements...` line appears). The baseline samples have already been emitted at that point.

## Results (iterations = 30)

| Metric | Baseline (ms) |
| ------ | ------------- |
| Min    | 4.05          |
| Max    | 7.58          |
| Mean   | 5.05          |
| Median | 4.73          |
| p95    | **7.05**      |

### Observations

- Baseline p95 of 7.05 ms establishes the reference budget for later comparisons.
- Variation is dominated by local Postgres latency; repeated runs stay within ±0.5 ms.
- Because the harness truncates the plan immediately after insertion, no background work or attempt records are generated during this measurement.

### Next steps

- Keep this snapshot untouched for regression comparisons.
- After significant infrastructure changes (e.g., schema migrations or database tuning) rerun the baseline and append the new summary below, clearly labelling the date and environment.
