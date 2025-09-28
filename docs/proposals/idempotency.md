# Idempotency Key Proposal

## Goal
Prevent duplicate learning plan generation attempts caused by client retries (network flakes, user double-submit) while preserving legitimate sequential regeneration.

## Scope
Applies to POST /api/v1/plans only.

## Mechanism
- Client supplies `Idempotency-Key` header (UUID v4 recommended)
- Server stores a short-lived record (Redis or DB table `idempotency_requests`)
- Key uniqueness per authenticated user
- If key seen and prior request succeeded (201) return previously created plan (body + status 201)
- If prior still in-progress return 409 with retry-after
- Keys expire after 24h (cleanup job)

## Data Model (Tentative)
```
id UUID PK
user_id UUID FK users(id)
key text not null
plan_id UUID FK learning_plans(id) nullable until success
status enum(pending, success, failed)
created_at timestamptz default now()
unique(user_id, key)
```

## Error Cases
- Missing header: proceed non-idempotent (MVP tolerant)
- Malformed UUID: 400
- Reuse with different payload hash: 422 conflict

## Future Enhancements
- Payload hash column for stronger replay integrity
- Global idempotency across multiple endpoints
