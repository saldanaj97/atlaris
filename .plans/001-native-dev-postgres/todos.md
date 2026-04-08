# Native Dev Postgres Migration

- [x] Create native dev Postgres migration planning artifacts
- [x] Replace dev-only Docker scripts with native PostgreSQL service commands
- [x] Update bootstrap messaging and development docs for native Postgres
- [x] Validate changed files and capture any lessons learned

## Review

- Replaced dev-only Docker scripts in `package.json` with native Homebrew PostgreSQL 17 service commands.
- Updated `scripts/bootstrap-local-db.ts` messaging for native Postgres troubleshooting.
- Refreshed development docs and `.env.example` to reflect native dev Postgres while keeping test Docker setup unchanged.
- Validation was a manual sanity pass because the repo Biome configuration ignores these file paths.
