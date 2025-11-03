## Task 7: Developer ergonomics and scripts

**Files:**

- Modify: `package.json` scripts or `pnpm` scripts to include `dev:regenerator`

**Step 1: Add worker script**

```json
// package.json scripts (example)
"dev:regenerator": "tsx src/workers/plan-regenerator.ts",
"dev:all": "concurrently \"pnpm dev\" \"pnpm dev:worker\" \"pnpm dev:regenerator\""
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore(workers): add regenerator dev script"
```

---
