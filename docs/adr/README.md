# Architecture decision records

Non-obvious decisions about Atlaris code. Comments are banned in `src/` (see the `delete-comment` skill in `.agents/skills/`), so rationale lives here.

## Index

| ADR | Title | Entries |
|-----|-------|---------|
| [0001](./0001-ai-providers-model-catalog-and-cost.md) | AI providers, model catalog and cost accounting | 98 |
| [0002](./0002-plan-and-lesson-generation-pipeline.md) | Plan and lesson generation pipeline, job queue and regeneration | 163 |
| [0003](./0003-billing-quotas-and-ai-spend.md) | Billing projection, quotas and AI spend ceilings | 52 |
| [0004](./0004-request-boundary-auth-proxy-and-flags.md) | Request boundary, auth, proxy, rate limits, flags and configuration | 74 |
| [0005](./0005-database-queries-and-rls.md) | Database queries, locking and RLS usage | 41 |
| [0006](./0006-email-notifications-delivery.md) | Email notification delivery | 9 |
| [0007](./0007-app-ui-and-marketing-surfaces.md) | App UI, navigation and marketing surfaces | 58 |
| [0008](./0008-intentionally-swallowed-errors.md) | Intentionally swallowed errors | 6 |

## Writing a new ADR

Use the next free number. Keep the sections Status, Context, Decisions and Consequences. Record why, not what: the constraint, the failure it prevents, the alternative that was rejected. Update this index and `docs/README.md` in the same change.
