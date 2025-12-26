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

## Performance Tips

### React Compiler (Automatic Memoization)

**React Compiler** (formerly "React Forget") is a **separate opt-in build tool** that automatically memoizes your components. It's stable (v1.0) and production-ready.

| Without React Compiler                               | With React Compiler                   |
| ---------------------------------------------------- | ------------------------------------- |
| Manual `useMemo`, `useCallback`, `React.memo` needed | Automatic - compiler handles it       |
| Must track dependencies carefully                    | Compiler analyzes code for you        |
| Easy to miss optimization opportunities              | Optimizes more thoroughly than manual |

**To enable:** Add `babel-plugin-react-compiler` to your build config. See [React Compiler docs](https://react.dev/learn/react-compiler).

> **Note:** React 19 itself does NOT auto-memoize. The compiler is a separate tool you must opt into.

### Manual Memoization (Without Compiler)

If you're **not using React Compiler**, only optimize when you **measure** a problem:

| Tool          | Use When                                   |
| ------------- | ------------------------------------------ |
| `React.memo`  | Component re-renders with same props       |
| `useMemo`     | Expensive calculation runs every render    |
| `useCallback` | Function reference causes child re-renders |
| `React.lazy`  | Bundle is too large, need code splitting   |

### Example: Memoizing Expensive Calculations

```tsx
// Only recalculates when `items` changes
const sortedItems = useMemo(() => {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}, [items]);
```

### Escape Hatches (With Compiler)

Even with React Compiler, `useMemo`/`useCallback` can still be used for **fine-grained control**:

```tsx
// Force specific memoization behavior (e.g., for effect dependencies)
const stableValue = useMemo(() => computeValue(input), [input]);

useEffect(() => {
  // Effect only runs when stableValue actually changes
  doSomething(stableValue);
}, [stableValue]);
```

**Tip:** Don't remove existing memoization when adopting the compiler—it works alongside manual memoization.

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
