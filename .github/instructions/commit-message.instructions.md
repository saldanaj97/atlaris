# Commit Message Instructions

## Format

Follow this structured format for all commit messages:

```
<type>: <short summary (50 chars max)>
<blank line>
<detailed description explaining the what and why>
<continuation of description if needed>
<blank line>
Changes:
- <bullet point of changes>
- <bullet point of changes>
- <bullet point of changes>
<blank line>
New files:
- <path to new file>
- <path to new file>
<blank line>
Tests cover:
- <test description with test ID if applicable>
- <test description with test ID if applicable>
```

## Structure Breakdown

### 1. Subject Line
- **Type**: Use conventional commit types (feat, fix, docs, style, refactor, test, chore)
- **Summary**: Imperative mood, no period, max 50 characters
- **Example**: `feat: implement Phase 4 API integration for async plan generation`

### 2. Body (Detailed Description)
- Leave one blank line after subject
- Explain **what** changed and **why** (not how)
- Wrap at 72 characters per line
- Use present tense
- Focus on the impact and reasoning

### 3. Changes Section
- Label with `Changes:`
- Use bullet points (-)
- List key modifications made to existing functionality
- Include middleware, API changes, enhancements, etc.
- Be specific about what was updated

### 4. New Files Section (if applicable)
- Label with `New files:`
- Use bullet points (-)
- List full paths to new files
- Only include files that are part of the feature implementation

### 5. Tests Cover Section (if applicable)
- Label with `Tests cover:`
- Use bullet points (-)
- Describe what each test validates
- Include test IDs in parentheses (e.g., T040, T041)
- Show test results if relevant (e.g., "6/6 tests passing")

## Example

```
feat: implement Phase 4 API integration for async plan generation
Add async job-based plan generation with status endpoint and rate limiting.
Plans are now created immediately with 'pending' status and processed by
background workers.

Changes:
- Update POST /api/v1/plans to enqueue jobs instead of inline generation
- Create GET /api/v1/plans/[planId]/status endpoint for status polling
- Add rate limiting middleware (10 requests per 60 minutes)
- Enhance RateLimitError with retryAfter field
- Add comprehensive test suite for all Phase 4 features (6/6 tests passing)

New files:
- src/app/api/v1/plans/[planId]/status/route.ts
- src/lib/api/rate-limit.ts
- tests/contract/plans.api-integration.spec.ts

Tests cover:
- Job enqueueing on plan creation (T040)
- Status transitions: pending → processing → ready/failed (T041)
- Rate limit enforcement with retryAfter (T042)
- Validation error handling without job creation (T043)
```

## Commit Types

- **feat**: New feature or functionality
- **fix**: Bug fix
- **docs**: Documentation only changes
- **style**: Code style changes (formatting, missing semi-colons, etc.)
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **test**: Adding or updating tests
- **chore**: Changes to build process, dependencies, or auxiliary tools

## Best Practices

1. **Be descriptive**: Anyone reading the commit should understand what changed and why
2. **Use imperative mood**: "Add feature" not "Added feature" or "Adds feature"
3. **Reference test IDs**: Include test identifiers when applicable
4. **Group related changes**: All changes in a commit should relate to the same feature/fix
5. **Include metrics**: When relevant, include pass rates, performance improvements, etc.
6. **Omit obvious sections**: If no new files or tests, omit those sections

## Notes

- The Changes section should focus on modifications to existing code or new behaviors
- The New files section should only list significant new files (not generated files)
- The Tests cover section should describe the test scenarios, not just list test names
- Use blank lines to separate sections for readability
