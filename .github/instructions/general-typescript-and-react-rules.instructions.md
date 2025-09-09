---
description: TypeScript and React development standards covering functional programming patterns, component structure, naming conventions, and type safety best practices.
applyTo: src/**/*.ts, src/**/*.tsx,
---

Apply the [clean code guidelines](./clean-code.instructions.md) to all code.
Apply the [code quality guidelines](./code-quality.instructions.md) to all code.

# General TypeScript and React Rules

- Write concise, readable TypeScript code.
- Use functional and declarative programming patterns.
- Follow DRY (Don't Repeat Yourself) principle.
- Implement early returns for better readability.
- Structure components logically: exports, subcomponents, helpers, types.
- Use descriptive names with auxiliary verbs (isLoading, hasError).
- Prefix event handlers with 'handle' (handleClick, handleSubmit).
- Use TypeScript for all code.
- Prefer interfaces over types.
- Avoid enums; use const maps instead.
- Implement proper type safety and inference.
- Use `satisfies` operator for type validation.
