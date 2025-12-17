# AGENTS.md

This file serves as a **directory** pointing to relevant documentation by topic. Read the appropriate docs based on what you're working on.

## Quick Reference

| Topic                     | Documentation                                                                    |
| ------------------------- | -------------------------------------------------------------------------------- |
| **Commands**              | [docs/development/commands.md](docs/development/commands.md)                     |
| **Environment & Logging** | [docs/development/environment.md](docs/development/environment.md)               |
| **Project Structure**     | [docs/architecture/project-structure.md](docs/architecture/project-structure.md) |
| **Database Schema**       | [docs/database/schema-overview.md](docs/database/schema-overview.md)             |
| **Database Client Usage** | [docs/database/client-usage.md](docs/database/client-usage.md)                   |
| **Testing**               | [docs/testing/test-standards.md](docs/testing/test-standards.md)                 |
| **TypeScript Rules**      | [docs/rules/typescript.md](docs/language/typescript.md)                          |
| **AI/Models**             | [docs/ai/available-models.md](docs/ai/available-models.md)                       |

## Instruction Files (`.github/instructions/`)

These apply automatically based on file patterns:

| File                                      | Applies To                 |
| ----------------------------------------- | -------------------------- |
| `general.instructions.md`                 | All files (`*`)            |
| `typescript.instructions.md`              | `**/*.ts`, `**/*.tsx`      |
| `reactjs.instructions.md`                 | React components in `src/` |
| `nextjs.instructions.md`                  | Next.js files in `src/`    |
| `commit-message.instructions.md`          | Commit messages            |
| `test-writing-guidelines.instructions.md` | `tests/**/*`               |

---

## Core Rules (Always Follow)

### Testing

- **NEVER run the full test suite.** Only run tests relevant to the task at hand.
- Use `vitest` command with appropriate flags, NOT `pnpm test`.
- See [docs/testing/test-standards.md](docs/testing/test-standards.md) for comprehensive guidance.

### GitHub Issues & Tasks

When working on a specific issue or task:

1. ALWAYS refer to the specific instructions in the issue description
2. Read referenced files carefully before making changes
3. Address dependencies on other issues first
4. Review linked documentation, designs, or resources
5. Consider subtasks and related issues
6. Verify all requirements met before marking complete

### Commits

- Only follow commit guidelines for **code changes** (not docs/tests/or any .md files).
- See [.github/instructions/commit-message.instructions.md](.github/instructions/commit-message.instructions.md)
- Only stage files discussed and modified for the task
- Run lint, type-check, and build before committing

### Documentation Lookup

When clarifying questions arise, use Context7 MCP to grab up-to-date documentation.

---

## Tech Stack Summary

| Category    | Technology                               |
| ----------- | ---------------------------------------- |
| Framework   | Next.js 15 (React 19, Turbopack)         |
| Language    | TypeScript                               |
| Package Mgr | pnpm                                     |
| Styling     | Tailwind CSS v4                          |
| Auth        | @clerk/nextjs                            |
| Database    | Drizzle ORM + Neon (PostgreSQL with RLS) |
| AI/LLM      | Vercel AI SDK + OpenRouter               |
| Payments    | Stripe                                   |
| Testing     | Vitest + Testing Library                 |

---

## Architecture Documentation

For deeper architectural understanding:

- [docs/architecture/project-structure.md](docs/architecture/project-structure.md) - Source layout, configs
- [docs/architecture/dependency-injection-architecture.md](docs/architecture/dependency-injection-architecture.md) - DI patterns
