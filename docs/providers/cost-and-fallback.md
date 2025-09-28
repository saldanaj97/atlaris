# Provider Cost & Fallback Considerations

This note captures the baseline assumptions and guardrails for operating the AI generation provider in production. It does **not** commit to a second provider implementation yet, but documents the plan for scaling beyond a single vendor.

## Baseline economics

- **Primary provider**: OpenAI `o4-mini` (streaming JSON) — selected for balance between reliability and cost.
- **Expected usage**: early stage launch anticipates ≤3 attempts per plan, with <2,000 plans/week.
- **Token budget**: average prompt ~900 tokens; completion ≤1,300 tokens → ~2,200 tokens/attempt.
- **Estimated cost**: at $0.002 / 1K tokens (prompt) + $0.006 / 1K tokens (completion), a typical attempt costs roughly $0.010–$0.012. Worst-case three attempts per plan stays < $0.04.
- **Operational threshold**: trigger renegotiation / optimization when monthly spend crosses $1,500 _or_ success rate drops below 90% due to retries.

Instrumentation hooks:

- Record model name + token counts via `ProviderMetadata.usage` (extended when the adapter lands).
- Aggregate usage nightly to detect drift (future metrics job).

## Fallback roadmap

| Stage        | Trigger                                                                   | Action                                                                                                          |
| ------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| S0 (current) | None                                                                      | Single provider behind thin `AiPlanGenerationProvider` abstraction. Failures bubble up as classified attempts.  |
| S1           | Sustained provider outages (<2h) or rate limits impacting >5% of requests | Introduce retry queue with exponential backoff before user-visible failure.                                     |
| S2           | Cost pressure (> $1.5k/month) or strategic redundancy requirement         | Add secondary provider (Anthropic / internal model). Implement routing policy with per-provider health metrics. |
| S3           | Regulatory / regional compliance need                                     | Geo-route to provider approved per region; ensure prompt hashing remains provider-agnostic.                     |

## Implementation guardrails

- Abstraction layer (`src/lib/ai/provider.ts`) must stay vendor-neutral; adapters populate `metadata.provider` and `metadata.model` to make routing observable.
- Fallback selection logic should live outside the orchestrator core (e.g., dedicated `providerRegistry` module) to keep retry semantics isolated.
- Maintain identical output contract across providers—parser assumes normalized JSON shape. Add provider-specific adapters if format diverges.
- Always log correlation ID + provider metadata for failures to simplify RCA (already covered by request context + attempt logging).

## Next steps (post-MVP)

1. Extend `ProviderMetadata` to include explicit cost estimates per attempt once billing hooks exist.
2. Prototype a shadow invocation path with a secondary provider to benchmark quality (logged but not persisted).
3. Add automated alert when `rate_limit` classification breaches configured threshold within a 1-hour rolling window.
4. Document provider-specific prompt differences before onboarding an additional vendor.
