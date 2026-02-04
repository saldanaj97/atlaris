# ADR 001: pg_session_jwt Feasibility Results

## Date

2026-02-03

## Status

Needs Discussion

## Context

We plan to migrate RLS identity to database-validated JWT sessions using the
pg_session_jwt extension with Clerk JWKS. A feasibility spike is required to
validate extension behavior with direct Postgres connections.

## Test Results

### Extension Installation

- Not run locally (no database access in this environment)
- Pending staging verification

### JWKS Configuration

- Clerk JWKS URL: TBD
- Cache duration: TBD
- JWKS reachability from database: Not verified

### JWT Validation

- auth.jwt_session_init(): Not verified
- auth.user_id(): Not verified
- Invalid/expired JWT handling: Not verified

### Error Handling

- Invalid signature: Not verified
- Expired JWT: Not verified
- JWKS unreachable: Not verified

### Performance

- Average validation latency: Not measured
- First request (JWKS fetch): Not measured

## Decision

Pending - run the feasibility spike in staging to confirm configuration and
latency before proceeding with production rollout.

## Next Steps

1. Enable pg_session_jwt in staging and confirm auth schema functions exist.
2. Configure Clerk JWKS and verify auth.jwt_session_init(auth_token) works.
3. Validate auth.user_id() returns the expected Clerk user id.
4. Capture error messages for invalid/expired JWTs and JWKS failures.
5. Measure JWT validation latency with JWKS cached.
