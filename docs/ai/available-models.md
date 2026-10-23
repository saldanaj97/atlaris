# Available AI Models

Each tier's selectable models come from that tier's OpenRouter guardrail, not from code. A guardrail change reaches users on the next sync, with no code change or deploy. Grounded generation has its own route definitions in `src/features/ai/model-operation-policy.ts` (`GROUNDED_MODELS_BY_TIER`, `PRO_GROUNDED_WRITER_CATALOG`, `PRO_GROUNDED_REVIEW_CATALOG`); only their pricing and output ceilings come from the synced data.

## Where the list comes from

`GET https://openrouter.ai/api/v1/models/user` ([docs](https://openrouter.ai/docs/api/api-reference/models/list-models-user)) returns the models a key's guardrail allows. Each tier key (`OPENROUTER_API_KEY_FREE`, `_STARTER`, `_PRO`) has its own guardrail, so each call returns that tier's list with OpenRouter's current name, pricing, context length, max output tokens and supported parameters.

`src/features/ai/model-catalog/` syncs it into `openrouter_tier_models`, keyed by `(tier, model_id)`:

| Piece                  | File                  | What it does                                                                                                                                                                   |
| :--------------------- | :-------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetchGuardrailModels` | `guardrail-models.ts` | Fetches with a 5s timeout. Skips and logs a malformed or variable (`-1`) priced model. A non-2xx response, a malformed body, or a list with no valid model throws.             |
| `syncTierModelCatalog` | `catalog.ts`          | Replaces the tier's rows in one transaction after a successful fetch. On any failure it keeps the last good rows and logs `model_catalog_sync_failed`.                         |
| `getTierModels`        | `catalog.ts`          | Reads a tier's rows, cheapest first. Refresh-on-read: rows older than 15 minutes (or none) sync first. After a failed sync, reads use the stored rows for 60s before retrying. |
| `getCatalogModel`      | `catalog.ts`          | Pricing and limits for one model id from the most recently synced tier. `openrouter/free` returns the code-owned `FREE_ROUTER_MODEL`.                                          |

A runtime syncs a tier only when it has that tier's own key; there is no fallback to `OPENROUTER_API_KEY`. The Next.js app has all three keys and keeps the table fresh. The jobs Worker has only `OPENROUTER_API_KEY`, so it reads what the app synced and never syncs.

The table is deny-all under RLS; only the service-role client reads or writes it.

## What stays in code

- **`openrouter/free`** (`FREE_ROUTER_MODEL` in `catalog.ts`): a router, not a model, so no guardrail lists it. It is free and has no output limit of its own.
- **Per-operation defaults** in `model-operation-policy.ts`: Starter outline, regeneration and lesson `openai/gpt-6-luna`; Pro outline `openai/gpt-6.1-sol`, regeneration `anthropic/claude-sonnet-5.5`, lesson `anthropic/claude-haiku-5.5`. A default missing from its tier's synced list falls back to the first listed model on the operation's grounded writer route (`GROUNDED_MODELS_BY_TIER`: Starter Luna then DeepSeek V4.1 Flash; Pro GPT-6 Sol then GPT-6.1 Sol), and `getModelsForTier` logs a `model_default_not_in_guardrail` warning naming `fallbackModelId`. When no fallback is listed either, the default becomes `openrouter/free` (added to the operation's list, so validation agrees; Settings never offers it) and the event is logged as an error. `resolveModelForTier` sets `freeRouterFallback` on that generation's resolution and sends one Sentry `captureMessage` per generation (`model_free_router_fallback`, fingerprinted by tier and operation), because paid users are now on a free model; settings and validation lookups only log. Fix the guardrail or the default when either log appears.
- **Picker-hidden models** (`PICKER_HIDDEN_MODEL_IDS_BY_TIER` in `model-operation-policy.ts`): guardrail models a tier keeps only for its grounded routes. `getModelsForTier` drops them before default and fallback resolution, so Settings never offers them and validation rejects them (`tier_denied`, falling back to the default). Starter hides `openai/gpt-6.1-sol`, its grounded verifier and advisor.
- **Pro-only display** (`getProOnlyModelsForTier` in `model-preferences.ts`, `proOnlyModels` on `GET /api/v1/user/preferences`): the Starter outline picker also lists its picker-hidden models and the Pro guardrail models missing from the Starter guardrail (runtime-only routers excluded), disabled with a "Pro plan" badge. They stay out of `getModelsForTier`, so validation still rejects them. Free and Pro get `[]`.
- **`DEFAULT_OUTPUT_TOKEN_CEILING`** (32,768) in `cost.ts`: the ceiling for models without a synced max output, and the cap on every grounded call's `max_tokens`.

## Subscription tiers

Access is gated per tier × operation by `getModelOperationPolicy()`; `getModelsForTier()` in `src/features/ai/ai-models.ts` returns the matching models.

| Tier    | Operation             | Default                       | Selectable models                                     |
| :------ | :-------------------- | :---------------------------- | :---------------------------------------------------- |
| Free    | outline, lesson       | `openrouter/free`             | `openrouter/free` only                                |
| Free    | regeneration          | not allowed                   | none                                                  |
| Starter | outline, regeneration | `openai/gpt-6-luna`           | the Starter guardrail list minus picker-hidden models |
| Starter | lesson                | `openai/gpt-6-luna`           | none in Settings; the default runs                    |
| Pro     | outline               | `openai/gpt-6.1-sol`          | `openrouter/free` plus the Pro guardrail list         |
| Pro     | regeneration          | `anthropic/claude-sonnet-5.5` | `openrouter/free` plus the Pro guardrail list         |
| Pro     | lesson                | `anthropic/claude-haiku-5.5`  | `openrouter/free` plus the Pro guardrail list         |

The Free guardrail's rows are synced but not selectable: Free users always get `openrouter/free`.

Starter lessons are code-owned: Settings offers no lesson picker, the preferences API rejects a Starter lesson pick, and a lesson pick saved on Pro is ignored after a downgrade (`savedModelIdForOperation`). The lesson request lists `openrouter/free` after the default (`getFallbackModelsForTier`), so OpenRouter serves the lesson from the free router when the default returns an error. That fallback does not cover the app's own lesson timeout. Non-grounded lessons use the Worker's `OPENROUTER_API_KEY`, whose guardrail allows `openrouter/free`; the Starter tier key's guardrail blocks it.

## Costs and output ceilings

`computeCostCents()` and `getOutputTokenCeiling()` in `src/features/ai/cost.ts` read the synced pricing and max output tokens. A model no guardrail lists is an unknown model. Every jobs Worker step that makes a model call runs inside `withDb`, so it reads the table. When the table cannot be read, cost lookups log `model_catalog_unavailable`, the estimate falls back to unknown, and the ceiling falls back to `DEFAULT_OUTPUT_TOKEN_CEILING`; provider-reported cost still applies.

Usage cost is computed when a usage event is recorded and stored on the row (`ai_usage_events.cost_cents` and `model_pricing_snapshot`), so a guardrail price change never reprices past usage.

## Model selection

Users pick a preferred model under **Settings → AI model** (`/settings/ai`). The value is stored on `user_preferences.preferred_ai_model` (Pro also has `preferred_regeneration_ai_model` and `preferred_lesson_ai_model`). Generation uses it while it stays in the user's synced tier × operation list. A saved pick that leaves the guardrail is not deleted: `resolveEffectivePreference` falls back to the operation default and Settings shows no saved pick, and it applies again if the guardrail adds it back. Persistable options exclude `openrouter/free`. The legacy `preferred_ai_model` PostgreSQL enum keeps its historical values; the column is `text`.
