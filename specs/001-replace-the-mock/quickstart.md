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
  "createdAt": "2025-09-27T12:00:00Z"
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
  "status": "pending",
  "modules": [],
  "latestAttempt": {
    "id": "<attempt-uuid>",
    "status": "failure",
    "classification": "timeout",
    "durationMs": 10000,
    "modulesCount": 0,
    "tasksCount": 0,
    "createdAt": "2025-09-27T12:00:05Z"
  }
}
```

Success example (classification null on success):

```json
{
  "id": "<plan-uuid>",
  "topic": "Foundations of Machine Learning",
  "status": "ready",
  "modules": [
    {
      "id": "<module-uuid>",
      "title": "Intro to Core Concepts",
      "order": 1,
      "estimatedMinutes": 120,
      "tasks": [
        {
          "id": "<task-uuid>",
          "title": "What is ML?",
          "order": 1,
          "estimatedMinutes": 30
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
    "createdAt": "2025-09-27T12:00:07Z"
  }
}
```

Failure (validation) example:

```json
{
  "id": "<plan-uuid>",
  "topic": "Foundations of Machine Learning",
  "status": "pending",
  "modules": [],
  "latestAttempt": {
    "id": "<attempt-uuid>",
    "status": "failure",
    "classification": "validation",
    "durationMs": 850,
    "modulesCount": 0,
    "tasksCount": 0,
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
