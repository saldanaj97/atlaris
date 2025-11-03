## Task 5: Queue priority behavior verification

**Files:**

- Modify: `src/lib/jobs/__tests__/queue.test.ts:1`

**Step 1: Extend existing test to prove priority > FIFO**

```ts
// src/lib/jobs/__tests__/queue.test.ts (add a case)
it('picks paid+priority before free', async () => {
  // enqueue free low priority, then paid high priority
  // expect getNextJob returns paid job first
});
```

**Step 2: Run tests**

Run: `vitest run src/lib/jobs/__tests__/queue.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/jobs/__tests__/queue.test.ts
git commit -m "test(queue): verify priority topics outrank FIFO"
```

---
