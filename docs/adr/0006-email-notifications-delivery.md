# ADR 0006: Email notification delivery

- Status: Accepted
- Date: 2026-11-20
- Source: moved here from inline code comments when comments were banned in `src/` (see the `delete-comment` skill). Each entry is the original comment text, grouped by the file it sat in.

## Context

Email delivery uses a durable ledger, leases and idempotency keys so that an ambiguous provider outcome is never mistaken for a failure. The reasoning below was kept in code comments across `src/features/notifications`.

## Decisions

### `src/features/notifications/email/content.ts`

- `starts.push` — Need threshold consecutive days ending yesterday (today idle).
- `for` — Bounded window only proves "at least threshold days", not lifetime streak.
- `if` — Delivery is sequential: a sent streak reminder must precede daily reminder processing so the latter can be suppressed in the same pass.

### `src/features/notifications/email/delivery-flag.ts`

- `async function resolveEmailNotificationDeliveryEnabled` — Fail closed when the Flagship flag cannot be evaluated.

### `src/features/notifications/email/delivery-service.ts`

- `recordDeliveryFailure` — Provider accepted the message; never mark failed. Leave the lease intact so a later reclaim can reuse the exact stored request.
- `async function runEmailNotificationDelivery` — Preference-gated, ledger-idempotent email delivery pass. Service-role only; call from the maintenance worker route.

### `src/features/notifications/email/resend-adapter.ts`

- `function createResendEmailSender` — Thin Resend sender. Never logs message bodies. Uses SDK idempotencyKey.
- `function classifyResend` — Definite client/config/validation failures are `rejected` (safe to mark failed). Transport/server ambiguity — including SDK `application_error` with null statusCode — must stay `unknown` so the leased pending row is retained.
- `const isRecipientFieldError` — Resend uses validation names for both shared request fields and recipients. Continue the page only when the provider explicitly identifies `to`.

## Consequences

The code no longer carries this rationale inline. A change that would alter one of the behaviors above should update this ADR in the same pull request, and a new non-obvious decision belongs in an ADR, not in a comment.
