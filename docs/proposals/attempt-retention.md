# Generation Attempt Retention Policy (Draft)

## Objectives
Balance observability & user-facing history with storage cost and privacy.

## Principles
1. Minimize personally identifiable content retention (topics, notes) when no longer needed
2. Preserve aggregate metrics for analytics (through anonymization) longer than raw attempts
3. Support user support/debug window (~30 days)

## Proposed Windows
| Data Element | Retention | Rationale |
|--------------|-----------|-----------|
| Raw generation_attempts rows | 30 days | Debugging recent issues |
| Successful attempt metadata (input truncation flags etc.) | 90 days | Product analytics |
| Failure classifications | 180 days aggregated | Reliability tracking |
| Aggregated daily stats (count, mean duration) | 365 days | Trend analysis |

## Purge Mechanism
- Nightly job evaluates cutoff timestamps
- Archive aggregated stats into `attempt_metrics_daily`
- Hard delete qualifying rows

## Anonymization
Before 30d purge, optional process to strip user_id and plan_id replacing with hashed bucket for cohort analysis.

## Compliance / Future
Policy can evolve to configurable per-tier retention (e.g., paid extends history).
