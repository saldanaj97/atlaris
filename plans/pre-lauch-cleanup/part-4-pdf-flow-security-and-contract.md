# Part 4 - PDF Flow Security and Contract Revalidation

Date: 2026-02-12
Scope: PDF upload/extract/create/generate path after the recent PDF-security hardening changes.

## Executive Verdict

- Critical trust-boundary issues are closed: PDF-origin requests require one-time, hash-bound, user-bound proof tokens.
- PDF context grounding and attempt-level provenance are now implemented end to end.
- Extraction hardening improved: per-user throttling + process-wide in-flight guard + abort propagation are in place.
- Main remaining gap is distributed/global concurrency control across instances plus payload minimization (raw text still returned).

## Status Matrix (Old Findings)

1. Forged PDF-origin payload bypass -> **Resolved**
2. Extracted PDF context not used for generation -> **Resolved**
3. CPU/memory abuse risk under load -> **Partially resolved**
4. Malware scanner placeholder -> **Resolved**
5. `/plans` vs `/plans/stream` drift risk -> **Resolved**
6. Validation duplication/no single authority -> **Resolved**
7. Extraction response too large -> **Mostly resolved (raw text still returned)**
8. Security invariants not covered by tests -> **Resolved for identified gaps**

## Closed Findings (No Longer Actionable as Originally Written)

- **1) Forged PDF-origin payload bypass (closed)**
  - **What changed:**
    - `/from-pdf/extract` now issues proof `{ token, extractionHash, expiresAt, version }` after extraction (`src/app/api/v1/plans/from-pdf/extract/route.ts:335`, `src/app/api/v1/plans/from-pdf/extract/route.ts:372`).
    - Both `/plans/stream` and `/plans` now require and verify proof for `origin='pdf'` (`src/app/api/v1/plans/stream/route.ts:100`, `src/app/api/v1/plans/route.ts:128`).
    - Schema enforces `pdfProofToken` + `pdfExtractionHash` for PDF origin (`src/lib/validation/learningPlans.ts:194`, `src/lib/validation/learningPlans.ts:202`).
    - Proof is one-time and user-bound via consume-on-verify (`src/lib/security/pdf-extraction-proof.ts:121`, `src/lib/security/pdf-extraction-proof.ts:150`).
  - **Coverage added:** forged hash + replay rejection in integration tests (`tests/integration/api/plans-stream.spec.ts:351`, `tests/integration/api/plans-stream.spec.ts:403`).

- **2) PDF context not grounded into generation (closed, baseline)**
  - **What changed:**
    - PDF context is sanitized and persisted on plan creation (`src/app/api/v1/plans/stream/route.ts:130`, `src/lib/db/schema/tables/plans.ts:50`).
    - Generation input now carries `pdfContext` (`src/app/api/v1/plans/stream/route.ts:146`, `src/lib/ai/types/provider.types.ts:15`).
    - Prompt builder injects bounded PDF context block (`src/lib/ai/prompts.ts:37`, `src/lib/ai/prompts.ts:148`).
    - Provider passes pdfContext into prompt construction (`src/lib/ai/providers/openrouter.ts:64`).
  - **Coverage added:** prompt/provider unit tests + stream integration test asserting forwarded context and provenance (`tests/unit/ai/prompts.spec.ts:164`, `tests/unit/ai/providers/openrouter.spec.ts:368`, `tests/integration/api/plans-stream.spec.ts:478`).

- **4) Malware scanner placeholder (closed)**
  - **What changed:**
    - Scanner now runs heuristic pre-filter + optional provider (`src/lib/security/malware-scanner.ts:133`, `src/lib/security/malware-scanner.ts:147`).
    - MetaDefender provider implemented (`src/lib/security/providers/metadefender.ts:73`).
    - Production guard prevents `AV_PROVIDER=none` (`src/lib/security/scanner-factory.ts:25`).
    - Route remains fail-closed (`SCAN_FAILED`) when scanner errors/timeouts (`src/app/api/v1/plans/from-pdf/extract/route.ts:269`, `src/app/api/v1/plans/from-pdf/extract/route.ts:275`).
  - **Coverage added:** unit tests for scanner orchestration/factory/provider + integration fail-closed tests (`tests/unit/security/malware-scanner.spec.ts:177`, `tests/unit/security/scanner-factory.spec.ts:40`, `tests/unit/security/metadefender-scanner.spec.ts:181`, `tests/integration/pdf-extract.spec.ts:227`).

## Open Findings (Prioritized)

### High

- **A) Extraction path still has cross-instance saturation risk**
  - **Impact:** abuse resistance improved, but current in-flight semaphore is process-local and not distributed.
  - **Evidence:**
    - Route now enforces process-wide in-flight guard with deterministic 429 + `Retry-After` (`src/lib/api/pdf-rate-limit.ts`, `src/app/api/v1/plans/from-pdf/extract/route.ts`).
    - Per-user throttle store is still in-memory and instance-local.
    - `req.signal` is now propagated to extraction.
  - **Recommended remediation:**
    - Move in-flight and rate-limit state to Redis/DB-backed coordination for multi-instance deployments.
    - Enforce upstream platform/CDN body-size limits in deployment settings.
  - **Suggested targeted tests:**
    - Integration/load tests in multi-instance topology validating deterministic saturation behavior.

### Medium

- **E) Extraction response still returns raw `text` even though UI consumes only structure**
  - **Impact:** payload is now bounded, but still larger/more sensitive than necessary for client workflows.
  - **Evidence:**
    - API returns `extraction.text` (`src/app/api/v1/plans/from-pdf/extract/route.ts:366`).
    - UI preview uses structure fields and does not consume returned text (`src/app/plans/new/components/PdfCreatePanel.tsx:202`).
  - **Recommended remediation:**
    - Return structure-first payload by default and gate raw text behind explicit debug/admin flag if needed.

- **F) Security test coverage closure status**
  - **Status:** previously missing invariants have been added.
  - **Coverage now includes:**
    - wrong-user and expired proof token rejection
    - `/plans` PDF-origin proof parity checks
    - extract-route parse-timeout and throttle assertions
    - stream-path replay/forged-hash/path-level provenance assertions

## Updated End-to-End Flow (Current)

1. Client uploads PDF to `/api/v1/plans/from-pdf/extract` (authenticated, aiGeneration rate-limited).
2. Route performs streamed size cap, per-user extraction throttle, and process-wide in-flight extraction guarding.
3. Route validates multipart payload via shared schema + PDF magic bytes.
4. Route scans file (heuristic + provider when configured); errors fail closed.
5. Route extracts with timeout + structural parsing, then caps response payload with truncation metadata.
6. Route computes extraction hash and issues short-lived one-time proof token.
7. Client submits `/api/v1/plans/stream` (or `/plans`) with `origin='pdf'`, `extractedContent`, `pdfProofToken`, `pdfExtractionHash`, and proof version.
8. Server runs shared PDF-origin intake logic (verify+consume proof, quota accounting, context sanitize/topic derivation), persists bounded context, and runs generation with grounded `pdfContext`.
9. Generation attempts persist PDF provenance (`extraction_hash`, `proof_version`, `context_digest`) in metadata and prompt-hash input.

## Next Iteration Recommendations

1. Move extraction throttle/concurrency state to distributed coordination (Redis/DB) for true cross-instance guarantees.
2. Enforce deployment-level body limits and document them alongside route-level checks.
3. Evaluate removing raw extracted `text` from default response contract and return structure-first payload only.
