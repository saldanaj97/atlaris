# PRD: Native Development Postgres

## Goal

Replace the Docker-based development database workflow with native PostgreSQL 17 while preserving the current developer experience and leaving the test Docker setup untouched.

## Acceptance Criteria

1. Dev scripts no longer depend on Docker, and the legacy dev compose file is removed.
2. The documented local connection URL remains `postgresql://postgres:postgres@localhost:54331/atlaris_dev`.
3. Test Docker configuration and workflow remain unchanged.
4. The repo docs explain the native setup, reset flow, and bootstrap steps clearly.
