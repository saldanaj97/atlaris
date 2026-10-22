# Grounded generation eval (JCS-163)

This eval decides, tier by tier, whether grounded generation (research, verifier, advisor) replaces the v15 pipeline. It runs the same 10 topics through both pipelines on staging, scores every lesson the same way, and checks the result against a strict pass bar. Code is in `scripts/eval/grounded/`. Manifests, judge caches and reports go to `tests/results/grounded-eval/`, which git ignores.

## Pass bar (per tier)

Every bar must pass. Missing evidence never counts as a pass.

| Bar                           | Target                                    | Source                                                                                                                        |
| ----------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Wrong outputs                 | 0                                         | Blind judge (`setup_mismatch`, `mistake_fix_no_change`, `wrong_answer_key`, `wrong_example_output`) plus the human spot-check |
| Flagged issues per lesson     | At least 50% fewer than v15               | Code checks plus blind judge, both arms                                                                                       |
| p95 module latency            | 4 min or less, no failed plans or modules | Runner clock                                                                                                                  |
| Cost per fully generated plan | Free $0.05, Starter $1.25, Pro $2.50      | Tier key usage delta                                                                                                          |

The cost caps assume AI spend is 20% of revenue (Starter $25/month over 4 plans, Pro $100/month over 8). This share is interim, so revise `COST_CAP_PER_PLAN_USD` in `scoring.ts` when it changes.

## Fairness rules

- **Blind judge.** The judge sees each lesson with the `[Sn]` markers and `sourceIds` removed. Its rubric is its own prompt, not the grounded verifier preset. The default model (`x-ai/grok-4.7`) is outside every writer, verifier and advisor route; v15 writes with Gemini. Override it with `EVAL_JUDGE_MODEL` and keep it the same for every tier.
- **Code checks** run on both arms. The citation codes (`citation_without_brief`, `unknown_source`, `raw_url`) are left out of the bar because v15 has no sources.
- **Reference only:** citation checks and a brief-aware judge pass on grounded lessons, plus the tier's own verifier issues in `generation_quality_issues`. These numbers never count toward the bar, because the grounded pipeline already repaired against its own verifier.
- **Known limit:** phrasing such as "according to the docs" can still reveal which arm wrote a lesson.

## Topics

The 10 topics are listed in `topics.ts`. Every plan asks for 4 hours a week, the `mixed` learning style, and a 14-day span. The span is within the free tier's 2-week limit, so every tier sends the same request.

## Setup

| Variable                        | Used by    | Value                                                                           |
| ------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| `EVAL_BASE_URL`                 | `run.ts`   | `https://staging.atlaris.app` (only staging or localhost is accepted)           |
| `EVAL_VERCEL_BYPASS`            | `run.ts`   | Staging deployment protection bypass                                            |
| `EVAL_CLERK_SECRET_KEY`         | `run.ts`   | Staging (dev instance) Clerk secret key                                         |
| `EVAL_SUPABASE_LINKED_DIR`      | `run.ts`   | Checkout linked to staging (`supabase link`); sets Starter and Pro users' tier  |
| `EVAL_TIER_OPENROUTER_API_KEY`  | `run.ts`   | The tier's grounded OpenRouter key, read only for its usage. Grounded arm only. |
| `EVAL_JUDGE_OPENROUTER_API_KEY` | `score.ts` | A separate key, so judge spend stays out of the tier keys                       |
| `EVAL_JUDGE_MODEL`              | `score.ts` | Optional judge override                                                         |

Every plan gets its own throwaway Clerk user (`eval-…@atlaris.app`), so per-user rate limits never hold plans back. For Starter and Pro, the runner provisions the user and then sets `users.subscription_tier` through `supabase db query --linked`, and it refuses any linked project other than staging. The staging Clerk allowlist admits only `atlaris.app`, which is why throwaway users use that domain. The launch waitlist must be off for the users, or the runner stops on the redirect.

## Run

1. With grounded generation off for the tier, collect v15:
   `pnpm exec tsx scripts/eval/grounded/run.ts collect --arm v15 --tier pro`
2. Turn grounded on for the tier: set the app flag `grounded-generation` and the Worker's `GROUNDED_GENERATION_<TIER>`. Then collect the grounded arm. Pilot with `--topics rust-ownership` first.
   `pnpm exec tsx scripts/eval/grounded/run.ts collect --arm grounded --tier pro`
3. Classify each arm's module failures from the staging lesson Workflow instances (run from the repo root; it uses `workers/jobs`' Wrangler login):
   `pnpm exec tsx scripts/eval/grounded/run.ts classify --manifest tests/results/grounded-eval/v15-pro.json`, then the same for the grounded manifest.
4. Optional: export the research briefs to a JSON file of `{ planId: { brief, sources: [{ key, title, url, publisher }] } }`, using the query below. Then score:
   `pnpm exec tsx scripts/eval/grounded/score.ts --tier pro --briefs briefs-pro.json`
5. Review `spot-check-pro.md` and record each verdict in a JSON file (`{"L01": "ok", "L02": "wrong"}`). Then rescore with `--spot-check <file>`. The bar stays pending until every grounded lesson on the sheet is marked `ok` or `wrong`. Cached judge verdicts are reused, so the rescore costs nothing.
6. Once the report is posted, delete the eval plans and throwaway users:
   `pnpm exec tsx scripts/eval/grounded/run.ts cleanup --manifest tests/results/grounded-eval/grounded-pro.json`

`--concurrency N` runs topics in batches of N (default 1). Use 3 for both arms: free models rate-limit and slow down under more load, which would add failures to one arm only. A manifest is written after each batch, and a rerun skips topics it already has, including any whose plan or modules failed. A run that errors out (for example a create-plan 5xx) is recorded under `abandoned` instead and retried on the next rerun; `cleanup` deletes its plan and user too, listing the user's plans when the create never answered. Each run's user and plan are also written to `abandoned` as soon as they are created, so stopping the runner mid-batch still leaves them for `cleanup`. A setup problem every topic would hit (a missing variable, a linked project other than staging, the waitlist redirect, lesson generation switched off, or cited lessons in a v15 run) stops the runner after the batch is written. If the closing key-usage read fails, the batch is still recorded with its cost unmeasured. GETs retry network errors, 5xx and 429. A module whose generate call answers 5xx three times in a row counts as failed. A module counts as timed out 20 minutes after it first starts, even if it drops back to not generated and is restarted. `collect` and `cleanup` refuse to run unless `EVAL_BASE_URL` matches the manifest's host. In scoring, a grounded plan whose outline failed, or a topic with no plan, fails the latency bar. Each plan keeps at most 2 modules generating at a time. A batch takes about as long as its slowest plan, roughly 10–15 minutes.

### Brief export

```sql
select r.plan_id,
       r.brief,
       json_agg(json_build_object('key', s.citation_key, 'title', s.title,
                                  'url', s.url, 'publisher', coalesce(s.publisher, ''))
                order by s.citation_key) as sources
from plan_research r
join research_sources s on s.research_id = r.id
where r.plan_id = any($1)
group by r.id;
```

## Measurement limits

- A module that starts on its own is timed from the first poll that sees it generating, so its time can be up to 10 seconds short.
- Cost is the tier key's usage before a batch and 60 seconds after it, divided evenly across the batch's plans (`costBatchSize`). With batches above 1, the cost bar checks the batch average, not each plan. Other traffic on that key during a run is counted too, so run one tier at a time on a quiet staging. v15 does not use the tier keys, so v15 cost is not measured.
- Reliability is reported apart from quality. `classify` labels each failed module `timeout`, `parse` or `other`, and records each module's longest provider call. It saves after each plan; a module whose workflow it can't read stays unclassified, the command exits 1, and a rerun retries only those modules. A failed module has no lessons, so it is left out of the quality comparison. Both arms run with production's lesson call timeout (`AI_LESSON_TIMEOUT_MS`, 300 s; 120 s before DEV-172). v15 writes a whole module per call and grounded writes one lesson per call, so v15 hits that limit first. A grounded timeout still fails the no-failed-modules bar, but the report marks it as an infrastructure cause (JCS-172).
- The grounded outline verifier and repair costs are included in the key delta, but no table records them.
