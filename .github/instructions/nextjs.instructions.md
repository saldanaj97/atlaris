---
description: 'Next.js development standards and instructions'
applyTo: 'src/app/**/*.tsx, src/app/**/*.ts, src/app/components/**/*.tsx, src/components/**/*.tsx, src/components/**/*.ts, src/hooks/**/*.ts, src/hooks/**/*.tsx'
---

# Next.js Best Practices for LLMs (2025)

_Last updated: September 2025_

This document summarizes the latest, authoritative best practices for building, structuring, and maintaining Next.js applications with TypeScript. It is intended for use by LLMs and developers to ensure code quality, maintainability, and scalability.

## Project Context

- Latest Next.js (App Router)
- TypeScript for type safety
- Modern CSS styling approaches
- Focus on performance, security, and developer experience

## 1. Project Structure & Organization

- **Use the `app/` directory** (App Router) for all new projects. Prefer it over the legacy `pages/` directory.
- **Top-level folders:**
  - `app/` — Routing, layouts, pages, and route handlers
  - `public/` — Static assets (images, fonts, etc.)
  - `lib/` — Shared utilities, API clients, and logic
  - `components/` — Reusable UI components
  - `contexts/` — React context providers
  - `styles/` — Global and modular stylesheets
  - `hooks/` — Custom React hooks
  - `types/` — TypeScript type definitions
- **Colocation:** Place files (components, styles, tests) near where they are used, but avoid deeply nested structures.
- **Route Groups:** Use parentheses (e.g., `(admin)`) to group routes without affecting the URL path.
- **Private Folders:** Prefix with `_` (e.g., `_internal`) to opt out of routing and signal implementation details.
- **Feature Folders:** For large apps, group by feature/domain (e.g., `app/dashboard/`, `app/auth/`).
- **Use `src/`** (optional): Place all source code in `src/` to separate from config files.

## 2. Architecture & Component Best Practices

### 2.1. App Router Architecture
- **App Router with server and client components** - Use the modern App Router approach
- **Group routes by feature/domain** - Organize related functionality together
- **Implement proper error boundaries** - Handle errors gracefully at component boundaries
- **Use React Server Components by default** - Leverage server-side rendering for better performance
- **Leverage static optimization where possible** - Use static generation when data doesn't change frequently

### 2.2. Server and Client Component Integration

**Never use `next/dynamic` with `{ ssr: false }` inside a Server Component.** This is not supported and will cause a build/runtime error.

**Correct Approach:**
- If you need to use a Client Component (e.g., a component that uses hooks, browser APIs, or client-only libraries) inside a Server Component, you must:
  1. Move all client-only logic/UI into a dedicated Client Component (with `'use client'` at the top).
  2. Import and use that Client Component directly in the Server Component (no need for `next/dynamic`).
  3. If you need to compose multiple client-only elements (e.g., a navbar with a profile dropdown), create a single Client Component that contains all of them.

**Example:**

```tsx
// Server Component
import DashboardNavbar from '@/components/DashboardNavbar';

export default async function DashboardPage() {
  // ...server logic...
  return (
    <>
      <DashboardNavbar /> {/* This is a Client Component */}
      {/* ...rest of server-rendered page... */}
    </>
  );
}
```

**Why:**
- Server Components cannot use client-only features or dynamic imports with SSR disabled.
- Client Components can be rendered inside Server Components, but not the other way around.

**Summary:**
Always move client-only UI into a Client Component and import it directly in your Server Component. Never use `next/dynamic` with `{ ssr: false }` in a Server Component.

### 2.3. Component Best Practices

- **Component Types:**
  - **Server Components** (default): For data fetching, heavy logic, and non-interactive UI.
  - **Client Components:** Add `'use client'` at the top. Use for interactivity, state, or browser APIs.
- **When to Create a Component:**
  - If a UI pattern is reused more than once.
  - If a section of a page is complex or self-contained.
  - If it improves readability or testability.
- **Naming Conventions:**
  - Use `PascalCase` for component files and exports (e.g., `UserCard.tsx`).
  - Use `camelCase` for hooks (e.g., `useUser.ts`).
  - Use `snake_case` or `kebab-case` for static assets (e.g., `logo_dark.svg`).
  - Name context providers as `XyzProvider` (e.g., `ThemeProvider`).
- **File Naming:**
  - Match the component name to the file name.
  - For single-export files, default export the component.
  - For multiple related components, use an `index.ts` barrel file.
- **Component Location:**
  - Place shared components in `components/`.
  - Place route-specific components inside the relevant route folder.
- **Props:**
  - Use TypeScript interfaces for props.
  - Prefer explicit prop types and default values.
- **Testing:**
  - Co-locate tests with components (e.g., `UserCard.test.tsx`).

## 3. TypeScript Best Practices

- **Strict mode enabled** - Use TypeScript strict mode for better type safety
- **Clear type definitions** - Define explicit types and interfaces for better code clarity
- **Proper error handling with type guards** - Use type guards for runtime type checking
- **Zod for runtime type validation** - Use Zod for validating data at runtime, especially API inputs/outputs
- **Use TypeScript for all code** - Enable `strict` mode in `tsconfig.json`

## 4. Naming Conventions

- **Folders:** `kebab-case` (e.g., `user-profile/`)
- **Files:** `PascalCase` for components, `camelCase` for utilities/hooks, `kebab-case` for static assets
- **Variables/Functions:** `camelCase`
- **Types/Interfaces:** `PascalCase`
- **Constants:** `UPPER_SNAKE_CASE`

## 5. State Management

- **React Server Components for server state** - Use Server Components to manage server-side state
- **React hooks for client state** - Use React hooks (useState, useReducer) for client-side state management
- **Proper loading and error states** - Always provide feedback for async operations
- **Optimistic updates where appropriate** - Implement optimistic UI updates for better user experience

## 6. Data Fetching

- **Server Components for direct database queries** - Fetch data directly in Server Components when possible
- **React Suspense for loading states** - Use Suspense boundaries for loading states
- **Proper error handling and retry logic** - Implement comprehensive error handling and retry mechanisms
- **Cache invalidation strategies** - Implement proper cache invalidation for dynamic data

## 7. API Routes (Route Handlers)

- **Prefer API Routes over Edge Functions** unless you need ultra-low latency or geographic distribution.
- **Location:** Place API routes in `app/api/` (e.g., `app/api/users/route.ts`).
- **HTTP Methods:** Export async functions named after HTTP verbs (`GET`, `POST`, etc.).
- **Request/Response:** Use the Web `Request` and `Response` APIs. Use `NextRequest`/`NextResponse` for advanced features.
- **Dynamic Segments:** Use `[param]` for dynamic API routes (e.g., `app/api/users/[id]/route.ts`).
- **Validation:** Always validate and sanitize input. Use libraries like `zod` or `yup`.
- **Error Handling:** Return appropriate HTTP status codes and error messages.
- **Authentication:** Protect sensitive routes using middleware or server-side session checks.

## 8. Styling Best Practices

- **Tailwind CSS with consistent color palette** - Use Tailwind CSS for utility-first styling and maintain a consistent design system
- **Shadcn** - If using shadcn for tailwind library, follow their component and styling conventions
- **Responsive design patterns** - Implement mobile-first responsive designs
- **Dark mode support** - Consider dark mode compatibility in styling choices
- **Follow container queries best practices** - Use container queries for component-based responsive design
- **Maintain semantic HTML structure** - Use proper HTML semantics for accessibility and SEO

## 9. Security Best Practices

- **Input validation and sanitization** - Always validate and sanitize all user inputs
- **Proper authentication checks** - Implement robust authentication and authorization
- **CSRF protection** - Protect against Cross-Site Request Forgery attacks
- **Rate limiting implementation** - Implement rate limiting on API routes
- **Secure API route handling** - Follow security best practices for API endpoints

## 10. Performance Best Practices

- **Image optimization with next/image** - Always use Next.js Image component for images
- **Font optimization with next/font** - Use Next.js font optimization features
- **Route prefetching** - Leverage Next.js automatic route prefetching
- **Proper code splitting** - Implement strategic code splitting for optimal bundle sizes
- **Bundle size optimization** - Monitor and optimize JavaScript bundle sizes

## 11. General Best Practices

- **TypeScript:** Use TypeScript for all code. Enable `strict` mode in `tsconfig.json`.
- **ESLint & Prettier:** Enforce code style and linting. Use the official Next.js ESLint config.
- **Environment Variables:** Store secrets in `.env.local`. Never commit secrets to version control.
- **Testing:** Use Jest, React Testing Library, or Playwright. Write tests for all critical logic and components.
- **Accessibility:** Use semantic HTML and ARIA attributes. Test with screen readers.
- **Performance:**
  - Use built-in Image and Font optimization.
  - Use Suspense and loading states for async data.
  - Avoid large client bundles; keep most logic in Server Components.
- **Security:**
  - Sanitize all user input.
  - Use HTTPS in production.
  - Set secure HTTP headers.
- **Documentation:**
  - Write clear code comments.
  - Document public APIs and components.

## 12. Implementation Process

Follow this systematic approach for new features:

1. **Plan component hierarchy** - Design the component structure before coding
2. **Define types and interfaces** - Establish clear TypeScript contracts
3. **Implement server-side logic** - Build Server Components and API routes first
4. **Build client components** - Add interactivity with Client Components
5. **Add proper error handling** - Implement comprehensive error boundaries
6. **Implement responsive styling** - Ensure cross-device compatibility
7. **Add loading states** - Provide user feedback during async operations
8. **Write tests** - Cover critical functionality with tests

# Avoid Unnecessary Example Files

Do not create example/demo files (like ModalExample.tsx) in the main codebase unless the user specifically requests a live example, Storybook story, or explicit documentation component. Keep the repository clean and production-focused by default.

# Always use the latest documentation and guides

- For every nextjs related request, begin by searching for the most current nextjs documentation, guides, and examples.
- Use the following tools to fetch and search documentation if they are available:
  - `resolve_library_id` to resolve the package/library name in the docs.
  - `get_library_docs` for up to date documentation.
