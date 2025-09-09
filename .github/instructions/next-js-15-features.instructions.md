---
description: Specifies the best practices for building React components within the Next.js 15 App Router structure.
applyTo: src/**/*.ts, src/**/*.tsx,
---

# Next.js 15 Component Architecture

- Favor React Server Components (RSC) where possible.
- Minimize 'use client' directives.
- Implement proper error boundaries.
- Use Suspense for async operations.
- Optimize for performance and Web Vitals.

# Next.js 15 Async Request API

- Always use async versions of runtime APIs:
  typescript
  const cookieStore = await cookies()
  const headersList = await headers()
  const { isEnabled } = await draftMode()
- Handle async params in layouts/pages:
  typescript
  const params = await props.params
  const searchParams = await props.searchParams

# Next.js 15 State Management

- Use `useActionState` instead of deprecated `useFormState`.
- Leverage enhanced `useFormStatus` with new properties (data, method, action).
- Implement URL state management with 'nuqs'.
- Minimize client-side state.
