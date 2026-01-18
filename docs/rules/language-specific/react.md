# React Development Guide

Quick reference for React development patterns in this project.

## Tech Stack

- **React 19+** with functional components
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **React Query** for server state
- **React Hook Form** for forms

---

## Component Basics

### Always Use Functional Components

```tsx
// ✅ Do this
function UserCard({ name, email }: UserCardProps) {
  return (
    <div>
      <h2>{name}</h2>
      <p>{email}</p>
    </div>
  );
}

// ❌ Don't use class components
class UserCard extends React.Component { ... }
```

### Keep Components Small

Each component should do **one thing**. If it's getting long, break it up.

```tsx
// ✅ Split into smaller pieces
function UserProfile() {
  return (
    <div>
      <UserAvatar />
      <UserInfo />
      <UserActions />
    </div>
  );
}

// ❌ Don't cram everything into one component
function UserProfile() {
  return <div>{/* 200 lines of JSX... */}</div>;
}
```

---

## State Management

### When to Use What

| Scenario                                 | Solution                |
| ---------------------------------------- | ----------------------- |
| Simple local state (toggle, input value) | `useState`              |
| Complex state with multiple actions      | `useReducer`            |
| Shared state across many components      | `useContext` or Zustand |
| Server data (API responses)              | React Query             |

### useState Example

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>Clicked {count} times</button>
  );
}
```

### useReducer for Complex State

```tsx
type Action = { type: 'increment' } | { type: 'decrement' } | { type: 'reset' };

function reducer(state: number, action: Action) {
  switch (action.type) {
    case 'increment':
      return state + 1;
    case 'decrement':
      return state - 1;
    case 'reset':
      return 0;
  }
}

function Counter() {
  const [count, dispatch] = useReducer(reducer, 0);
  // dispatch({ type: 'increment' })
}
```

---

## Effects & Side Effects

### useEffect Rules

1. **Always include dependencies** - or you'll get infinite loops
2. **Return a cleanup function** - prevents memory leaks
3. **Keep effects focused** - one effect per concern

```tsx
// ✅ Correct
useEffect(() => {
  const subscription = api.subscribe(userId);

  return () => {
    subscription.unsubscribe(); // Cleanup!
  };
}, [userId]); // Dependencies listed

// ❌ Missing dependencies = bugs
useEffect(() => {
  fetchUser(userId); // userId not in deps = stale data
}, []);
```

---

## Performance & React Compiler

### React Compiler is Enabled

This project uses **React Compiler** (`babel-plugin-react-compiler@1.0.0`) with Next.js's native SWC integration. It's configured in `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  reactCompiler: true,
};
```

The compiler automatically memoizes components and values at build time, eliminating the need for manual `useMemo`, `useCallback`, and `React.memo` in most cases.

### Rules for New Code

**For new components and hooks:** Do NOT add manual memoization. Let the compiler handle it.

```tsx
// ✅ New code - let compiler optimize
function ProductList({ items, onSelect }) {
  const sortedItems = items.toSorted((a, b) => a.name.localeCompare(b.name));
  const handleClick = (item) => onSelect(item.id);

  return (
    <ul>
      {sortedItems.map((item) => (
        <ProductCard
          key={item.id}
          item={item}
          onClick={() => handleClick(item)}
        />
      ))}
    </ul>
  );
}

// ❌ Unnecessary - compiler does this automatically
function ProductList({ items, onSelect }) {
  const sortedItems = useMemo(
    () => items.toSorted((a, b) => a.name.localeCompare(b.name)),
    [items]
  );
  const handleClick = useCallback((item) => onSelect(item.id), [onSelect]);
  // ...
}
```

### Rules for Existing Code

**Do NOT remove existing `useMemo`/`useCallback` calls.** The React team explicitly advises:

> "For existing code, we recommend either leaving existing memoization in place (removing it can change compilation output) or carefully testing before removing the memoization."

Reasons to leave existing memoization alone:

1. Removing it can change how the compiler optimizes that code
2. Risk of introducing subtle runtime bugs
3. Requires regression testing with no user-facing benefit
4. The compiler respects and works alongside manual memoization

### When Manual Memoization is Still Valid

Use `useMemo`/`useCallback` as **escape hatches** for fine-grained control:

**1. Effect dependencies** - When you need explicit control over when an effect runs:

```tsx
// Valid use case: useCallback for effect dependency
const fetchData = useCallback(async () => {
  const response = await fetch(`/api/items/${id}`);
  setData(await response.json());
}, [id]);

useEffect(() => {
  void fetchData();
}, [fetchData]); // Explicit control over effect timing
```

**2. Opting out of compilation** - Use `"use no memo"` directive for problematic components:

```tsx
function ProblematicComponent() {
  'use no memo'; // Skip compilation for this component
  // ...
}
```

**3. Opting in selectively** - If using `compilationMode: 'annotation'`:

```tsx
function OptimizedComponent() {
  'use memo'; // Opt this component into compilation
  // ...
}
```

### Verifying Compiler is Working

1. **React DevTools**: Optimized components show a **"Memo ✨"** badge
2. **Build output**: Look for `react/compiler-runtime` imports in compiled code
3. **ESLint**: `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps` are set to `error`

### Summary Table

| Scenario                        | Action                                                      |
| ------------------------------- | ----------------------------------------------------------- |
| Writing new component           | Skip `useMemo`/`useCallback` - compiler handles it          |
| Existing code with memoization  | Leave it alone                                              |
| Function used in effect deps    | `useCallback` is valid escape hatch                         |
| Component causing issues        | Add `"use no memo"` directive, fix root cause               |
| Expensive non-React calculation | Consider memoizing outside React (e.g., module-level cache) |

---

## React 19: Activity Component

New in React 19.2+ - use `<Activity>` to hide components while preserving their state.

### When to Use

✅ **Good fit:**

- Tabs where you want to keep form data when switching
- Sidebars that should remember scroll position
- Pre-loading expensive content in background

❌ **Bad fit:**

- Simple dropdowns/menus (use CSS instead)
- Components with CSS animations (Activity uses `display: none`)
- Lightweight components with no state to preserve

### Example

```tsx
import { Activity } from 'react';

function TabContainer() {
  const [activeTab, setActiveTab] = useState('home');

  return (
    <>
      <TabButtons onSelect={setActiveTab} />

      {/* Both tabs stay mounted, state preserved */}
      <Activity mode={activeTab === 'home' ? 'visible' : 'hidden'}>
        <HomeTab />
      </Activity>
      <Activity mode={activeTab === 'settings' ? 'visible' : 'hidden'}>
        <SettingsTab />
      </Activity>
    </>
  );
}
```

---

## Common Patterns

### Custom Hooks

Extract reusable logic into hooks:

```tsx
// hooks/useToggle.ts
function useToggle(initial = false) {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue((v) => !v), []);
  return [value, toggle] as const;
}

// Usage
function Modal() {
  const [isOpen, toggleOpen] = useToggle();
}
```

### Conditional Rendering

```tsx
// Simple condition
{
  isLoggedIn && <Dashboard />;
}

// If/else
{
  isLoggedIn ? <Dashboard /> : <LoginPrompt />;
}

// Multiple conditions - use early returns
function Status({ status }: { status: string }) {
  if (status === 'loading') return <Spinner />;
  if (status === 'error') return <ErrorMessage />;
  return <Content />;
}
```

### Lists with Keys

Always use stable, unique keys:

```tsx
// ✅ Use unique ID
{
  users.map((user) => <UserCard key={user.id} user={user} />);
}

// ❌ Don't use array index as key (causes bugs with reordering)
{
  users.map((user, index) => <UserCard key={index} user={user} />);
}
```

---

## Accessibility Checklist

- [ ] Use semantic HTML (`<button>`, `<nav>`, `<main>`, etc.)
- [ ] Add `aria-label` to icon-only buttons
- [ ] Ensure keyboard navigation works (Tab, Enter, Escape)
- [ ] Provide alt text for images
- [ ] Test with screen reader

---

## Quick Debugging

1. **React DevTools** - inspect component tree and state
2. **Console warnings** - React tells you what's wrong, read them!
3. **Strict Mode** - catches common bugs (enabled by default in dev)

```tsx
// Check if your effect is running twice in dev - that's Strict Mode
// It's intentional and helps find bugs. Don't disable it.
```

---

## Further Reading

- [Official React Docs](https://react.dev)
- [Testing standards](../testing/test-standards.md)
