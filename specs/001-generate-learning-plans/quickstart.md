# Quickstart: AI‑Backed Learning Plan Generation

This guide demonstrates creating a learning plan, observing the pending state, and retrieving generation attempts.

## 1. Create a Plan

(Authenticated request – replace TOKEN)

```bash
curl -X POST https://example.com/api/v1/plans \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "topic": "Foundations of Machine Learning",
    "skillLevel": "beginner",
    "weeklyHours": 6,
    "learningStyle": "mixed",
    "visibility": "private",
    "origin": "ai",
    "notes": "Focus on intuition and practical exercises"
  }'
```

Response (201) (plan initially pending):

```json
{
  "id": "<plan-uuid>",
  "topic": "Foundations of Machine Learning",
  "skillLevel": "beginner",
  "weeklyHours": 6,
  "learningStyle": "mixed",
  "visibility": "private",
  "origin": "ai",
  "createdAt": "2025-09-27T12:00:00Z",
  "status": "pending"
}
```

(Modules/tasks absent until generation success.)

## 2. Poll Plan Detail

```bash
curl -H 'Authorization: Bearer TOKEN' \
  https://example.com/api/v1/plans/<plan-uuid>
```

Pending example (failure attempt recorded, plan still pending because no modules created and attempt cap not yet exceeded):

```json
{
  "id": "<plan-uuid>",
  "topic": "Foundations of Machine Learning",
  "skillLevel": "beginner",
  "weeklyHours": 6,
  "learningStyle": "mixed",
  "visibility": "private",
  "origin": "ai",
  "createdAt": "2025-09-27T12:00:00Z",
  "status": "pending",
  "modules": [],
  "latestAttempt": {
    "id": "<attempt-uuid>",
    "status": "failure",
    "classification": "timeout",
    "durationMs": 10000,
    "modulesCount": 0,
    "tasksCount": 0,
    "truncatedTopic": false,
    "truncatedNotes": false,
    "normalizedEffort": false,
    "promptHash": "2f7b5d6a5d3c4e019c7f1b2a3d4e5f6a",
    "metadata": {
      "input": {
        "topic": { "truncated": false, "original_length": 34 },
        "notes": null
      },
      "normalization": {
        "modules_clamped": false,
        "tasks_clamped": false
      },
      "timing": {
        "started_at": "2025-09-27T12:00:04Z",
        "finished_at": "2025-09-27T12:00:14Z",
        "duration_ms": 10000,
        "extended_timeout": false
      },
      "provider": null,
      "failure": { "classification": "timeout", "timed_out": true }
    },
    "model": null,
    "createdAt": "2025-09-27T12:00:14Z"
  }
}
```

Success example (classification null on success):

```json
{
  "id": "<plan-uuid>",
  "topic": "Foundations of Machine Learning",
  "skillLevel": "beginner",
  "weeklyHours": 6,
  "learningStyle": "mixed",
  "visibility": "private",
  "origin": "ai",
  "createdAt": "2025-09-27T12:01:00Z",
  "status": "ready",
  "modules": [
    {
      "id": "<module-uuid>",
      "title": "Intro to Core Concepts",
      "order": 1,
      "description": "Foundational ideas and terminology",
      "estimatedMinutes": 120,
      "tasks": [
        {
          "id": "<task-uuid>",
          "title": "What is ML?",
          "order": 1,
          "description": null,
          "estimatedMinutes": 30,
          "status": "not_started",
          "resources": []
        }
      ]
    }
  ],
  "latestAttempt": {
    "id": "<attempt-uuid>",
    "status": "success",
    "classification": null,
    "durationMs": 4321,
    "modulesCount": 5,
    "tasksCount": 32,
    "truncatedTopic": false,
    "truncatedNotes": false,
    "normalizedEffort": false,
    "promptHash": "a8c1e9d77ee5c418a77c51f4d2537a21",
    "metadata": {
      "input": {
        "topic": { "truncated": false, "original_length": 34 },
        "notes": {
          "truncated": false,
          "original_length": 58
        }
      },
      "normalization": {
        "modules_clamped": false,
        "tasks_clamped": false
      },
      "timing": {
        "started_at": "2025-09-27T12:00:02Z",
        "finished_at": "2025-09-27T12:00:06Z",
        "duration_ms": 4321,
        "extended_timeout": false
      },
      "provider": { "model": "gpt-4.1" },
      "failure": null
    },
    "model": "gpt-4.1",
    "createdAt": "2025-09-27T12:00:06Z"
  }
}
```

Failure (validation) example:

```json
{
  "id": "<plan-uuid>",
  "topic": "Foundations of Machine Learning",
  "skillLevel": "beginner",
  "weeklyHours": 6,
  "learningStyle": "mixed",
  "visibility": "private",
  "origin": "ai",
  "createdAt": "2025-09-27T12:00:00Z",
  "status": "pending",
  "modules": [],
  "latestAttempt": {
    "id": "<attempt-uuid>",
    "status": "failure",
    "classification": "validation",
    "durationMs": 850,
    "modulesCount": 0,
    "tasksCount": 0,
    "truncatedTopic": false,
    "truncatedNotes": true,
    "normalizedEffort": false,
    "promptHash": "b1ec2aa142b84c108a86dc990f1bb0fb",
    "metadata": {
      "input": {
        "topic": { "truncated": false, "original_length": 34 },
        "notes": {
          "truncated": true,
          "original_length": 2100
        }
      },
      "normalization": {
        "modules_clamped": false,
        "tasks_clamped": false
      },
      "timing": {
        "started_at": "2025-09-27T12:00:00Z",
        "finished_at": "2025-09-27T12:00:01Z",
        "duration_ms": 850,
        "extended_timeout": false
      },
      "provider": {
        "model": "gpt-4.1",
        "error": "STRUCTURE_INVALID"
      },
      "failure": { "classification": "validation", "timed_out": false }
    },
    "model": "gpt-4.1",
    "createdAt": "2025-09-27T12:00:01Z"
  }
}
```

Failure (capped) response (HTTP 429):

```json
{
  "error": "attempt cap reached",
  "classification": "capped"
}
```

## 3. List Attempt History

```bash
curl -H 'Authorization: Bearer TOKEN' \
  https://example.com/api/v1/plans/<plan-uuid>/attempts
```

Response (200):

```json
[
  {
    "id": "<attempt-uuid-3>",
    "status": "success",
    "classification": null,
    "durationMs": 4321,
    "modulesCount": 5,
    "tasksCount": 32,
    "truncatedTopic": false,
    "truncatedNotes": false,
    "normalizedEffort": true,
    "promptHash": "a8c1e9d77ee5c418a77c51f4d2537a21",
    "metadata": {
      "input": {
        "topic": { "truncated": false, "original_length": 34 },
        "notes": {
          "truncated": false,
          "original_length": 58
        }
      },
      "normalization": {
        "modules_clamped": true,
        "tasks_clamped": false
      },
      "timing": {
        "started_at": "2025-09-27T12:00:02Z",
        "finished_at": "2025-09-27T12:00:06Z",
        "duration_ms": 4321,
        "extended_timeout": false
      },
      "provider": { "model": "gpt-4.1" },
      "failure": null
    },
    "model": "gpt-4.1",
    "createdAt": "2025-09-27T12:00:06Z"
  },
  {
    "id": "<attempt-uuid-2>",
    "status": "failure",
    "classification": "timeout",
    "durationMs": 10000,
    "modulesCount": 0,
    "tasksCount": 0,
    "truncatedTopic": false,
    "truncatedNotes": false,
    "normalizedEffort": false,
    "promptHash": "2f7b5d6a5d3c4e019c7f1b2a3d4e5f6a",
    "metadata": {
      "input": {
        "topic": { "truncated": false, "original_length": 34 },
        "notes": null
      },
      "normalization": {
        "modules_clamped": false,
        "tasks_clamped": false
      },
      "timing": {
        "started_at": "2025-09-27T11:59:45Z",
        "finished_at": "2025-09-27T11:59:55Z",
        "duration_ms": 10000,
        "extended_timeout": false
      },
      "provider": null,
      "failure": { "classification": "timeout", "timed_out": true }
    },
    "model": null,
    "createdAt": "2025-09-27T11:59:55Z"
  },
  {
    "id": "<attempt-uuid-1>",
    "status": "failure",
    "classification": "validation",
    "durationMs": 850,
    "modulesCount": 0,
    "tasksCount": 0,
    "truncatedTopic": false,
    "truncatedNotes": true,
    "normalizedEffort": false,
    "promptHash": "b1ec2aa142b84c108a86dc990f1bb0fb",
    "metadata": {
      "input": {
        "topic": { "truncated": false, "original_length": 34 },
        "notes": {
          "truncated": true,
          "original_length": 2100
        }
      },
      "normalization": {
        "modules_clamped": false,
        "tasks_clamped": false
      },
      "timing": {
        "started_at": "2025-09-27T11:59:30Z",
        "finished_at": "2025-09-27T11:59:31Z",
        "duration_ms": 850,
        "extended_timeout": false
      },
      "provider": {
        "model": "gpt-4.1",
        "error": "STRUCTURE_INVALID"
      },
      "failure": { "classification": "validation", "timed_out": false }
    },
    "model": "gpt-4.1",
    "createdAt": "2025-09-27T11:59:31Z"
  }
]
```

## 4. Error / Cap Examples

- Attempt cap exceeded: HTTP 429 with body `{ "error": "attempt cap reached", "classification": "capped" }` (attempt logged, no provider call).
- Provider rate limit: failure attempt classification=rate_limit; plan remains pending.

## 5. Cleanup (Optional)

Deletion not yet implemented; ignore for now.

## Notes

- Adaptive timeout: Deterministic (10s base; single extension to 20s only if a well‑formed module parsed before 9.5s).
- Input truncation flags appear in attempt metadata (not shown in examples).
- Effort normalization sets `normalizedEffort=true` if any duration clamped.
- Success attempts have `classification: null`.
