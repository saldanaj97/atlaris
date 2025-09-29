# Generation Attempt Metadata Schema

This document describes the canonical shape of the `generation_attempts.metadata` JSON payload. The schema provides parity with the data-model and test expectations so downstream analytics (or debugging tools) can reason about truncation, normalization, timing, and provider signals without inspecting raw tables.

## Top-level structure

Each attempt stores a JSON object with five primary sections:

| Key             | Type         | Description                                                                                                                               |
| --------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `input`         | object       | Truncation metadata for the learner-provided topic and optional notes.                                                                    |
| `normalization` | object       | Flags that indicate whether module or task effort minutes were clamped during normalization.                                              |
| `timing`        | object       | High-precision timing envelope for the attempt. Captures start/end timestamps, total duration, and whether the adaptive timeout extended. |
| `provider`      | object\|null | Provider-supplied metadata (model name, token counts, etc.). Populated by adapters; null when unavailable.                                |
| `failure`       | object\|null | Failure summary (classification + timeout flag) recorded only for unsuccessful attempts.                                                  |

### `input`

| Path                          | Type         | Description                                                                               |
| ----------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| `input.topic.truncated`       | boolean      | `true` when the topic exceeded 200 characters and was truncated before the provider call. |
| `input.topic.original_length` | integer      | Original topic length prior to truncation.                                                |
| `input.notes`                 | object\|null | Present only when notes were supplied. Null when no notes were provided.                  |
| `input.notes.truncated`       | boolean      | `true` when notes exceeded 2,000 characters and were truncated.                           |
| `input.notes.original_length` | integer      | Original notes length.                                                                    |

### `normalization`

| Path                            | Type    | Description                                                                      |
| ------------------------------- | ------- | -------------------------------------------------------------------------------- |
| `normalization.modules_clamped` | boolean | Indicates any module duration fell outside 15–480 minutes and required clamping. |
| `normalization.tasks_clamped`   | boolean | Indicates any task duration fell outside 5–120 minutes and required clamping.    |

### `timing`

| Path                      | Type    | Description                                                                                                            |
| ------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `timing.started_at`       | string  | ISO-8601 timestamp captured immediately before the provider call.                                                      |
| `timing.finished_at`      | string  | ISO-8601 timestamp captured after persistence completes.                                                               |
| `timing.duration_ms`      | integer | Rounded difference between `finished_at` and `started_at` (milliseconds). Always >0 and <25,000 (see precision tests). |
| `timing.extended_timeout` | boolean | `true` when the adaptive timeout extended from 10s to 20s due to early module detection.                               |

### `provider`

`provider` mirrors the adapter metadata (`ProviderMetadata`). Common fields:

- `provider` – provider identifier (e.g., `openai`).
- `model` – concrete model label (e.g., `o4-mini`).
- `usage` – optional token accounting (`promptTokens`, `completionTokens`, `totalTokens`).

Adapters may extend this object; keep additions backward compatible and document them here when introduced.

### `failure`

Failures include a compact summary so alerts/reporting do not need to parse outer columns:

| Path                     | Type    | Description                                                                                     |
| ------------------------ | ------- | ----------------------------------------------------------------------------------------------- |
| `failure.classification` | string  | One of `validation`, `provider_error`, `rate_limit`, `timeout`, `capped`.                       |
| `failure.timedOut`       | boolean | Indicates whether the adaptive timeout fired (true) or the failure occurred for another reason. |

This object is set to `null` for success attempts.

## Example payload

```json
{
  "input": {
    "topic": { "truncated": false, "original_length": 42 },
    "notes": null
  },
  "normalization": {
    "modules_clamped": false,
    "tasks_clamped": true
  },
  "timing": {
    "started_at": "2025-09-27T12:00:00.000Z",
    "finished_at": "2025-09-27T12:00:18.650Z",
    "duration_ms": 18650,
    "extended_timeout": true
  },
  "provider": {
    "provider": "simulated",
    "model": "simulated-extended",
    "usage": {
      "promptTokens": 842,
      "completionTokens": 1298,
      "totalTokens": 2140
    }
  },
  "failure": null
}
```

## Change management

- Maintain backward compatibility: add new keys rather than renaming/removing existing ones.
- Update this document and the mapper tests when introducing new metadata fields.
- Keep payload free of sensitive raw content; lengths, booleans, and hashes are acceptable. If a new field might include user text, document the redaction policy before shipping.
