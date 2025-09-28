# AI Generation Performance Harness

This note captures the initial performance validation for the AI-backed learning plan generation flow. Measurements come from the scripted harness in `scripts/perf/measure-generation.ts`, executed against the local Supabase stack (service role connection on `127.0.0.1:54322`). All runs were executed on macOS with Node 20 via `pnpm tsx`.

## Prerequisites

- Local Postgres/Supabase instance seeded with the project schema and data (`DATABASE_URL` defaults to `postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
- `pnpm install` completed and the Supabase instance running before invoking the harness.
- Optional: export `PERF_CLERK_USER_ID` and `PERF_USER_EMAIL` to reuse an existing synthetic user; otherwise the script will create `perf-harness-user` automatically.

## How to run

```bash
pnpm tsx scripts/perf/measure-generation.ts --iterations=50
```

The harness will:

1. Insert and immediately remove synthetic plans to measure the historical "baseline" (plan insert without background orchestration).
2. Repeat the measurement with the full async orchestration path (`runGenerationAttempt` scheduled immediately after the plan insert).
3. Replay deterministic simulations for timeout and extended-timeout scenarios using a virtual clock to keep total runtime low.
4. Emit a JSON report to stdout containing descriptive statistics and scenario outcomes.

## Baseline vs async generation results

Latest sample run (`iterations=30`, executed 2025-09-28T03:19:51Z):

| Metric | Baseline (ms) | Async Generation (ms) | Δ (Async − Baseline) |
| ------ | ------------- | --------------------- | -------------------- |
| Min    | 4.66          | 4.18                  | −0.48                |
| Max    | 8.78          | 8.38                  | −0.40                |
| Mean   | 6.22          | 5.32                  | −0.90                |
| Median | 6.03          | 5.20                  | −0.83                |
| p95    | **7.45**      | **7.23**              | **−0.22**            |

**Observation:** The asynchronous generation path adds no measurable overhead to the synchronous create response. The observed p95 delta (−0.22 ms) easily satisfies the < +200 ms requirement. Variability is dominated by local Postgres latency; repeated runs of 30–50 iterations remain within the same envelope.

## Timeout vs extended-timeout simulations

The harness reuses the production orchestrator with injected simulated providers and a virtual clock to produce deterministic durations without waiting 20 real seconds.

| Scenario | Classification | Duration (ms) | Timeout Extended? |
| -------- | -------------- | ------------- | ----------------- |
| Timeout  | `timeout`      | 10 000        | No                |
| Extended | `success`      | 19 400        | Yes               |

**Observation:** Adaptive timeout behaves as designed— the run extends close to 20 s only when a module stream is detected before the 9.5 s threshold. Straight timeouts abort exactly at the 10 s budget.

## Follow-up recommendations

- Re-run the harness after significant database or API changes and append the JSON payload (or deltas) to this document.
- Increase `--iterations` to 75–100 for release-grade reporting; the script stays under one minute on a laptop.
- Consider piping the JSON to a file for historical comparison:

  ```bash
  pnpm tsx scripts/perf/measure-generation.ts --iterations=75 > artifacts/perf/run-$(date +%Y%m%d).json
  ```
