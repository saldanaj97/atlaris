---
description: CI/CD workflow rules for development and AI agents
applyTo: '**/*'
---

# Development Workflow Rules

These rules ensure consistent, safe contributions to the codebase. They apply to both human developers and AI agents making changes.

---

## Branch Rules

### ALWAYS branch from `develop`

```bash
# Correct
git checkout develop && git pull && git checkout -b feature/xyz

# Wrong - branching from main for feature work
git checkout main && git checkout -b feature/xyz

# Wrong - branching from stale develop
git checkout -b feature/xyz  # without pulling first
```

### NEVER push directly to protected branches

Protected branches: `main`, `develop`

```bash
# Wrong - will be rejected
git push origin main
git push origin develop

# Correct - use PRs
git push origin feature/xyz
# Then open PR via GitHub
```

---

## Commit Rules

### Use conventional commit format

```
<type>: <short summary>

<optional body explaining why>

Changes:
- <bullet points of what changed>
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### One logical change per commit

```bash
# Good - focused commits
git commit -m "feat: add user avatar component"
git commit -m "test: add avatar component tests"

# Bad - mixed concerns
git commit -m "feat: add avatar, fix header, update deps"
```

### Never commit secrets or credentials

Before committing, verify:

- No `.env` files (except `.env.example`)
- No API keys, tokens, or passwords
- No `credentials.json` or similar

```bash
# Check what you're about to commit
git diff --staged
```

---

## Pull Request Rules

### PR Target Selection

| Your branch type         | Target branch                       |
| ------------------------ | ----------------------------------- |
| Feature/fix/chore        | `develop`                           |
| Hotfix (urgent prod fix) | `main` (then backport to `develop`) |

### PR Checklist (before requesting review)

1. **CI passes** - All checks green
2. **No merge conflicts** - Rebase if needed
3. **Tests added/updated** - For new functionality
4. **Self-reviewed** - Read your own diff first

### PR Title Format

Use the same conventional commit format:

```
feat: add user profile page
fix: resolve login redirect loop
chore: update TypeScript to 5.x
```

### PR Description

Include:

- **What** this PR does (1-2 sentences)
- **Why** this change is needed
- **How** to test it (if not obvious)

---

## Merge Rules

### Squash and Merge (preferred)

For feature PRs, squash commits into one clean commit:

- Keeps history clean
- Makes reverts easier
- One commit = one feature

### Never force push to shared branches

```bash
# DANGEROUS on shared branches
git push --force  # NO

# Acceptable only on YOUR feature branch before review
git push --force-with-lease origin feature/my-branch
```

### Delete branch after merge

GitHub can do this automatically. If not:

```bash
git branch -d feature/my-branch
git push origin --delete feature/my-branch
```

---

## Rules for AI Agents

When an AI agent is making changes:

### Before making commits

1. **Verify you're on a feature branch** (not `develop` or `main`)
2. **Only commit files related to the task** - Never commit unrelated changes
3. **Check for secrets** - Scan diff for credentials before commit

### Before pushing

1. **Ensure CI will pass** - Run lint/type-check locally if possible
2. **Confirm branch name** - Must be a feature branch
3. **Never push to `develop` or `main` directly**

### When creating PRs

1. **Target `develop`** (unless explicitly told otherwise for hotfix)
2. **Use conventional commit format** for PR title
3. **Include clear description** of changes made

### Forbidden actions (unless explicitly authorized)

| Action                                | Why it's forbidden      |
| ------------------------------------- | ----------------------- |
| `git push origin main`                | Bypasses CI and review  |
| `git push origin develop`             | Bypasses CI and review  |
| `git push --force` on shared branches | Destroys history        |
| `git commit --amend` after push       | Rewrites public history |
| Committing `.env` files               | Exposes secrets         |
| Deleting tests to make CI pass        | Hides bugs              |

### Safe operations (always allowed)

| Action                               | When               |
| ------------------------------------ | ------------------ |
| Create feature branch from `develop` | Starting work      |
| Commit to feature branch             | During development |
| Push feature branch                  | Sharing work       |
| Open PR to `develop`                 | Ready for review   |
| Rebase feature branch on `develop`   | Before PR          |

---

## CI Failure Response

When CI fails:

### For lint/type errors

```bash
# Run locally to see all errors
pnpm lint
pnpm type-check

# Fix and commit
git add .
git commit -m "fix: resolve lint errors"
git push
```

### For test failures

```bash
# Run failing tests locally
pnpm test

# Never delete or skip tests to make CI pass
# Fix the code, not the tests
```

### For build failures

```bash
# Try building locally
pnpm build

# Check for missing dependencies, type errors, etc.
```

---

## Git Worktrees (Multi-Feature Development)

For developing multiple features simultaneously:

### Creating a New Worktree

```bash
# 1. Create a worktree for a second feature
git worktree add ../atlaris-feature-b -b feature/feature-b origin/develop

# 2. Copy all .env files to the new worktree
cp .env* ../atlaris-feature-b/

# 3. Work in that directory
cd ../atlaris-feature-b

# 4. Install dependencies (each worktree needs its own node_modules)
pnpm install
```

### One-Liner for Quick Setup

```bash
# Create worktree + copy env files + install deps in one command
git worktree add ../atlaris-feature-b -b feature/feature-b origin/develop && \
  cp .env* ../atlaris-feature-b/ && \
  cd ../atlaris-feature-b && \
  pnpm install
```

### Environment Files to Copy

The project uses multiple `.env` files:

| File                       | Purpose                          |
| -------------------------- | -------------------------------- |
| `.env.local`               | Local development overrides      |
| `.env.test`                | Test environment configuration   |
| `.env.staging`             | Staging environment reference    |
| `.env.prod`                | Production environment reference |
| `.env.example`             | Template for new developers      |
| `.env.sentry-build-plugin` | Sentry build configuration       |

**Important:** Always copy ALL `.env*` files. Missing env files will cause runtime errors.

### Rules for Worktrees

- Each worktree should work on ONE feature
- Always base new worktrees on `develop`
- Always copy `.env*` files immediately after creating the worktree
- Each worktree needs its own `pnpm install` (node_modules are not shared)
- Clean up worktrees when done: `git worktree remove <path>`

### Cleaning Up Worktrees

```bash
# When done with a feature, remove the worktree
git worktree remove ../atlaris-feature-b

# If you deleted the directory manually, prune the worktree reference
git worktree prune
```

---

## Emergency: Production Hotfix

Only when a critical bug is in production and cannot wait:

```bash
# 1. Branch from main (exception to normal rule)
git checkout main && git pull
git checkout -b hotfix/critical-payment-bug

# 2. Fix the issue (minimal change)

# 3. PR to main (exception to normal rule)
# Get expedited review

# 4. After merge to main, backport to develop
git checkout develop && git pull
git cherry-pick <hotfix-commit-sha>
git push origin develop
```

**This is the ONLY case where you PR directly to `main`.**

---

## Summary Checklist

Before ANY push or PR:

- [ ] I'm on a feature branch (not `develop` or `main`)
- [ ] My branch is based on latest `develop`
- [ ] I only committed files related to my task
- [ ] No secrets or credentials in my commits
- [ ] Commit messages follow conventional format
- [ ] PR targets `develop` (unless hotfix)
- [ ] CI checks pass

---

## Related Files

- `docs/context/ci/branching-strategy.md` - Full explanation of branching model
- `.github/workflows/ci-pr.yml` - PR validation workflow
- `.github/workflows/ci-trunk.yml` - Full CI + deploy triggers
- `.github/instructions/commit-message.instructions.md` - Detailed commit message format
