# ADR 0008: Intentionally swallowed errors

- Status: Accepted
- Date: 2026-11-20
- Source: moved here from inline code comments when comments were banned in `src/` (see the `delete-comment` skill). Each entry is the original comment text, grouped by the file it sat in.

## Context

A few catch blocks are empty on purpose. Each one was explained by a comment on the empty block. These are the allowed exceptions to the "do not swallow errors" rule in AGENTS.md: best-effort cleanup, storage that may be disabled, and untrusted input that is allowed to be malformed.

## Decisions

### `src/app/(app)/settings/billing/components/CheckoutSubscriptionSync.tsx`

- `}` — Keep polling until the bounded timeout; webhook lag can coincide with transient errors.

### `src/components/shared/nav/desktop-sidebar-state.ts`

- `}` — Private mode or disabled storage.
- `}` — Private mode or disabled storage.

### `src/features/ai/abort.ts`

- `}` — Ignore cleanup failures.

### `src/features/ai/providers/openrouter.ts`

- `}` — Non-JSON error body (an HTML gateway page); keep the status message.

### `src/lib/i18n/locale.ts`

- `}` — Ignore malformed BCP-47 tags from untrusted Accept-Language headers.

## Consequences

The code no longer carries this rationale inline. A change that would alter one of the behaviors above should update this ADR in the same pull request, and a new non-obvious decision belongs in an ADR, not in a comment.
