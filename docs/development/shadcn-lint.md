# shadcn lint rules

`pnpm lint` runs Oxlint with the `@shadcn/lint` JS plugin (`jsPlugins` in `.oxlintrc.json`). It enforces the design system on `className` usage. Read this before changing `.oxlintrc.json` or working around a `shadcn(...)` error.

## Rules in use

All six plugin rules are on:

| Rule                            | Catches                                                 | Repo configuration                                                              |
| ------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `shadcn/no-restyle`             | Restyling a component through `className`               | Pages may add `layout` classes only; per-component `contracts` open more        |
| `shadcn/no-arbitrary-values`    | Values such as `p-[13px]`                               | Exact allowlist of existing design values                                       |
| `shadcn/no-unknown-classes`     | Classes Tailwind cannot generate                        | Default text-size scale is removed, so `text-sm` is unknown; use `type-*` roles |
| `shadcn/no-raw-colors`          | Raw palette colors such as `bg-red-500`                 | `fill-mode-both` allowed                                                        |
| `shadcn/no-inline-styles`       | `style={...}` and `<style>`                             | No exceptions                                                                   |
| `shadcn/require-static-classes` | Classes the linter cannot read, such as `` `bg-${x}` `` | Off inside `src/components/ui/**`                                               |

`src/components/ui/**` also turns off `no-arbitrary-values`, because the primitives own their recipes.

## How `no-restyle` contracts work

```jsonc
"shadcn/no-restyle": ["error", {
  "allow": ["layout"],
  "contracts": [
    { "pattern": "^CardTitle$", "allow": ["layout", "typography", "type-*"] },
    { "pattern": "^Input$", "allow": ["layout"] }
  ]
}]
```

- `pattern` is a regex on the component name.
- `allow` takes class groups (`layout`, `spacing`, `typography`, `color`, `border`, ...), exact classes (`duration-300`) and globs (`type-*`, `mt-*`). A contract can also `deny` classes.
- Wherever a contract allows `typography`, it also allows `type-*`, so the design-system type roles work on those components.

## When lint blocks a class

1. Use an existing variant or prop on the component.
2. If the need is real and repeated, add a `cva` variant in `src/components/ui/<component>.tsx`. Examples: the `search` variant on `Input`, the `interactive` variant on `Card`.
3. Add a contract entry only for a deliberate extension point. Keep it narrow: an exact class beats a group.
4. For a new exact design value, add it to the `no-arbitrary-values` allowlist only if no token or `type-*` role fits.

Do not turn a rule off for a file to get past an error.

## Checking a class or rule quickly

- Does Tailwind generate this class, and what CSS? `pnpm exec tsx scripts/dev/tw-classes.ts type-title 'sm:type-card'`
- Does a rule flag this usage? Lint one file: `pnpm exec oxlint path/to/file.tsx --max-warnings=0`.
- Plugin documentation: `node_modules/@shadcn/lint/README.md` (sections "You decide what can change" and "Contracts").
