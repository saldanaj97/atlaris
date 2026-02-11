# Changelog

## Unreleased

### Added

- AI-backed learning plan generation replacing mock provider
- Generation attempts tracking with classification (timeout, rate_limit, validation, capped)
- Adaptive streaming parser and timeout controller
- Contract, integration, and unit test coverage for core generation flows
- RLS policies for generation_attempts table
- Regeneration worker processor and authenticated internal drain endpoint
- Regeneration queue feature flags (`REGENERATION_QUEUE_ENABLED`, inline fallback, drain cap, worker token)
- Bounded PDF extraction response contract with explicit truncation metadata (`truncated`, `maxBytes`, `returnedBytes`)

### Changed

- Plan detail status derivation now uses generation status + attempts + module presence (no legacy job queue coupling)
- Regeneration enqueue now deduplicates concurrent active jobs per plan
- PDF extraction request validation now reuses shared validation schemas

### Documentation

- Traceability matrix linking FR/NFR to tests
- Performance appendix and metrics
- Phase 3 cleanup checklist completed in `plans/plan-generation-audit/phase-3.md`
