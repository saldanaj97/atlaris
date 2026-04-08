# Native Dev Postgres Migration Plan

## Step 1.0 - Confirm acceptance criteria

- Development database moves from Docker to native PostgreSQL 17.
- Test Docker setup remains unchanged, including `docker-compose.test.yml` and Neon local HTTP proxy usage.
- Existing local connection shape remains `postgresql://postgres:postgres@localhost:54331/atlaris_dev` to avoid app-code churn.
- `.env.local` must not be modified by the agent.

## Steps 1.1-1.3 - Implementation

1. Update `package.json` dev database scripts to use Homebrew PostgreSQL 17 service commands instead of Docker.
2. Update `scripts/bootstrap-local-db.ts` messaging so native Postgres troubleshooting is accurate.
3. Refresh development docs and env examples to match the native Postgres workflow while leaving test docs/setup unchanged.

## Validation Steps

- Read back the changed files to confirm script/doc consistency.
- Run targeted repository checks on the touched files when available.

## Issue Verification & Closure

- Verify the documented setup commands preserve the existing development `DATABASE_URL` shape.
- Verify docs explicitly preserve Docker for tests.
- Provide the user with exact local commands to run after code changes land.
