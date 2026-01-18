# AGENTS.md

This file serves as a **directory** pointing to relevant documentation by topic. Read the appropriate docs based on what you're working on.

## External File Loading

CRITICAL: When you encounter a file reference (e.g., @rules/general.md), use your Read tool to load it on a need-to-know basis. They're relevant to the SPECIFIC task at hand.

Instructions:

- Do NOT preemptively load all references - use lazy loading based on actual need
- When loaded, treat content as mandatory instructions that override defaults
- Follow references recursively when needed

## General Guidelines

Read the following file immediately as it's relevant to all workflows: @docs/rules/general/\*.md.

For project structure and organization: @docs/rules/architecture/project-structure.md

## Development Guidelines

For TypeScript code style and best practices: @docs/rules/language-specific/typescript.md

For React component architecture and hooks patterns: @docs/rules/language-specific/react.md

For testing strategies and coverage requirements: @docs/rules/testing/test-standards.md

For CLI commands and scripts: @docs/rules/development/commands.md

For environment variables and logging: @docs/rules/development/environment.md

For database schema overview: @docs/rules/database/schema-overview.md

For database client usage: @docs/rules/database/client-usage.md

For AI models and availability: @docs/rules/ai/available-models.md

For styling, colors, and glassmorphism guidelines: @docs/rules/styles/styling.md

## Architecture Documentation

For deeper architectural understanding:

- For Source layout, configs: docs/rules/architecture/project-structure.md

- For dependency injection patterns: docs/rules/architecture/dependency-injection-architecture.md

## Skills (for agents that do not support them natively)

| Skill Name              | Agent Name            | Path to skill                        |
| ----------------------- | --------------------- | ------------------------------------ |
| **GH Address Comments** | `gh-address-comments` | `.github/skills/gh-address-comments` |
| **GH Fix CI**           | `gh-fix-ci`           | `.github/skills/gh-fix-ci`           |

---

## Core Rules (Always Follow)

### Testing

- **NEVER run the full test suite.** Only run tests relevant to the task at hand.
- Use `pnpm test:changed` or `pnpm test:watch` for development.
- See [docs/testing/test-standards.md](docs/rules/testing/test-standards.md) for comprehensive guidance.

### GitHub Issues & Tasks

When working on a specific github issue or task:

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

| Category          | Technology                               |
| ----------------- | ---------------------------------------- |
| Framework         | Next.js 16 (React 19, Turbopack)         |
| language-specific | TypeScript                               |
| Package Mgr       | pnpm                                     |
| Styling           | Tailwind CSS v4                          |
| Auth              | @clerk/nextjs                            |
| Database          | Drizzle ORM + Neon (PostgreSQL with RLS) |
| AI/LLM            | Vercel AI SDK + OpenRouter               |
| Payments          | Stripe                                   |
| Testing           | Vitest + Testing Library                 |

---
