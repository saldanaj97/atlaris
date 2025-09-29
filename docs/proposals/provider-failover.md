# Provider Failover Strategy (Draft)

## Goal
Maintain generation availability when the primary AI provider degrades or rate limits.

## Tiers
1. Primary: OpenAI (streaming, best quality)
2. Secondary: Anthropic or Gemini (JSON mode)
3. Tertiary: Internal lightweight model / cached template fallback

## Trigger Signals
- Elevated timeout classification rate > X% over last N attempts
- Consecutive provider errors (HTTP 5xx) threshold
- Rate limit classification spikes (>= 3 within rolling 1m window)

## Decision Engine
- Health metrics stored in in-memory ring buffer + persisted snapshot
- State machine: healthy → degraded → failover → recovery
- Cooldown before automatic recovery (e.g., 10 minutes stable success)

## Request Routing
- On failover, new generation attempts use secondary provider adapter implementing same interface
- Attempts tagged with provider used (metadata.provider = 'openai' | 'anthropic' ...)

## Consistency & Classification
- Keep classification semantics provider-agnostic
- Map provider-specific errors to internal canonical error types

## Observability
- Emit structured logs with correlation_id, provider, latency_ms, classification
- Dashboard panels: success rate, latency, failover state, classification distribution

## Future Enhancements
- Weighted routing (A/B quality evaluation)
- Cost-aware dynamic routing (shift to cheaper provider under heavy load)
- Pre-warming / health check pings
