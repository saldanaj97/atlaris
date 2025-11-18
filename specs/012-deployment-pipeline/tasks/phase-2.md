# Phase 2: Worker Configuration

## Overview

Create Docker configuration and Fly.io deployment manifests for the four worker applications (staging and production instances of both plan generation and regeneration workers).

## Prerequisites

- Phase 1 completed (Fly.io apps created, CLI authenticated)
- Local repository cloned and up to date
- Docker installed locally (for testing builds)

## Tasks

### Task 2.1: Create Worker Dockerfile

**Objective:** Create a single Dockerfile that can run either worker type based on the command argument.

**Steps:**

1. Create `Dockerfile.worker` in the project root:

```dockerfile
# syntax = docker/dockerfile:1

# Base image with Node.js LTS
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile --prod

# Build the application
FROM base AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build TypeScript (if needed for workers)
RUN pnpm build || echo "No build step needed"

# Production image
FROM base AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy built application
COPY --from=builder --chown=worker:nodejs /app .

USER worker

# Default to plan generation worker (can be overridden)
CMD ["pnpm", "tsx", "src/workers/index.ts"]
```

2. Save the file at `/Users/juansaldana/Projects/atlaris/Dockerfile.worker`

**Verification:**

- [ ] File created at `Dockerfile.worker` in project root
- [ ] Syntax is valid (run `docker build -f Dockerfile.worker -t test .` to verify)

**Expected Output:**

- `Dockerfile.worker` created and ready for Fly.io deployments

---

### Task 2.2: Create Fly.io Configuration for Staging Plan Generator

**Objective:** Create `fly.staging.worker.toml` for the staging plan generation worker.

**Steps:**

1. Create `fly.staging.worker.toml` in the project root:

```toml
# Fly.io configuration for staging plan generation worker
app = "atlaris-worker-staging"
primary_region = "sjc"  # Change to region closest to your Neon database

[build]
  dockerfile = "Dockerfile.worker"

[env]
  NODE_ENV = "production"

[processes]
  app = "pnpm tsx src/workers/index.ts"

# VM resources (start small, scale up if needed)
[vm]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256

# Process check (verifies process is running)
[checks]
  [checks.process]
    type = "process"
    interval = "15s"
    timeout = "10s"
    grace_period = "30s"

# Restart policy
[restart]
  policy = "always"
  max_retries = 5

# Metrics
[metrics]
  port = 9091  # Optional: if you add a metrics endpoint later
  path = "/metrics"
```

2. Save the file at `/Users/juansaldana/Projects/atlaris/fly.staging.worker.toml`

**Verification:**

- [ ] File created at `fly.staging.worker.toml` in project root
- [ ] App name matches Fly.io app created in Phase 1: `atlaris-worker-staging`
- [ ] Region set to one closest to your Neon database (check Neon dashboard for region)

**Expected Output:**

- `fly.staging.worker.toml` created

---

### Task 2.3: Create Fly.io Configuration for Staging Plan Regenerator

**Objective:** Create `fly.staging.regenerator.toml` for the staging plan regeneration worker.

**Steps:**

1. Create `fly.staging.regenerator.toml` in the project root:

```toml
# Fly.io configuration for staging plan regeneration worker
app = "atlaris-worker-regenerator-staging"
primary_region = "sjc"  # Change to region closest to your Neon database

[build]
  dockerfile = "Dockerfile.worker"

[env]
  NODE_ENV = "production"

[processes]
  app = "pnpm tsx src/workers/plan-regenerator.ts"

# VM resources
[vm]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256

# Process check
[checks]
  [checks.process]
    type = "process"
    interval = "15s"
    timeout = "10s"
    grace_period = "30s"

# Restart policy
[restart]
  policy = "always"
  max_retries = 5

# Metrics
[metrics]
  port = 9091
  path = "/metrics"
```

2. Save the file at `/Users/juansaldana/Projects/atlaris/fly.staging.regenerator.toml`

**Verification:**

- [ ] File created at `fly.staging.regenerator.toml` in project root
- [ ] App name matches: `atlaris-worker-regenerator-staging`
- [ ] Process command points to `src/workers/plan-regenerator.ts`

**Expected Output:**

- `fly.staging.regenerator.toml` created

---

### Task 2.4: Create Fly.io Configuration for Production Plan Generator

**Objective:** Create `fly.prod.worker.toml` for the production plan generation worker.

**Steps:**

1. Create `fly.prod.worker.toml` in the project root:

```toml
# Fly.io configuration for production plan generation worker
app = "atlaris-worker-prod"
primary_region = "sjc"  # Change to region closest to your Neon database

[build]
  dockerfile = "Dockerfile.worker"

[env]
  NODE_ENV = "production"

[processes]
  app = "pnpm tsx src/workers/index.ts"

# VM resources (same as staging for now)
[vm]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256

# Process check
[checks]
  [checks.process]
    type = "process"
    interval = "15s"
    timeout = "10s"
    grace_period = "30s"

# Restart policy
[restart]
  policy = "always"
  max_retries = 5

# Metrics
[metrics]
  port = 9091
  path = "/metrics"
```

2. Save the file at `/Users/juansaldana/Projects/atlaris/fly.prod.worker.toml`

**Verification:**

- [ ] File created at `fly.prod.worker.toml` in project root
- [ ] App name matches: `atlaris-worker-prod`

**Expected Output:**

- `fly.prod.worker.toml` created

---

### Task 2.5: Create Fly.io Configuration for Production Plan Regenerator

**Objective:** Create `fly.prod.regenerator.toml` for the production plan regeneration worker.

**Steps:**

1. Create `fly.prod.regenerator.toml` in the project root:

```toml
# Fly.io configuration for production plan regeneration worker
app = "atlaris-worker-regenerator-prod"
primary_region = "sjc"  # Change to region closest to your Neon database

[build]
  dockerfile = "Dockerfile.worker"

[env]
  NODE_ENV = "production"

[processes]
  app = "pnpm tsx src/workers/plan-regenerator.ts"

# VM resources
[vm]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256

# Process check
[checks]
  [checks.process]
    type = "process"
    interval = "15s"
    timeout = "10s"
    grace_period = "30s"

# Restart policy
[restart]
  policy = "always"
  max_retries = 5

# Metrics
[metrics]
  port = 9091
  path = "/metrics"
```

2. Save the file at `/Users/juansaldana/Projects/atlaris/fly.prod.regenerator.toml`

**Verification:**

- [ ] File created at `fly.prod.regenerator.toml` in project root
- [ ] App name matches: `atlaris-worker-regenerator-prod`
- [ ] Process command points to `src/workers/plan-regenerator.ts`

**Expected Output:**

- `fly.prod.regenerator.toml` created

---

### Task 2.6: Test Docker Build Locally

**Objective:** Verify the Dockerfile builds successfully before pushing to Fly.io.

**Steps:**

1. Build the Docker image locally:

   ```bash
   docker build -f Dockerfile.worker -t atlaris-worker-test .
   ```

2. Verify the build completes without errors

3. (Optional) Test run the container locally:

   ```bash
   docker run --rm \
     -e DATABASE_URL="your-local-db-url" \
     -e NODE_ENV="development" \
     atlaris-worker-test
   ```

   - Press Ctrl+C to stop after verifying it starts

4. Clean up test image:
   ```bash
   docker rmi atlaris-worker-test
   ```

**Verification:**

- [ ] Docker build completes successfully
- [ ] No build errors or warnings
- [ ] Container starts without immediate crashes (if tested)

**Expected Output:**

- Confirmation that Dockerfile builds successfully

---

### Task 2.7: Create .dockerignore File

**Objective:** Optimize Docker builds by excluding unnecessary files.

**Steps:**

1. Create `.dockerignore` in the project root (or update if exists):

```
# Dependencies
node_modules
.pnpm-store

# Build outputs
.next
dist
out
build
coverage

# Environment files
.env*
!.env.example

# Git
.git
.gitignore

# Documentation
*.md
docs
specs

# Tests
tests
*.spec.ts
*.spec.tsx
*.test.ts
*.test.tsx

# IDE
.vscode
.idea
.cursor
.claude

# CI
.github

# Logs
*.log
npm-debug.log*
yarn-debug.log*
pnpm-debug.log*

# OS
.DS_Store
Thumbs.db

# Vercel
.vercel

# Misc
.worktrees
```

2. Save the file at `/Users/juansaldana/Projects/atlaris/.dockerignore`

**Verification:**

- [ ] File created at `.dockerignore` in project root
- [ ] Rebuild Docker image and verify it's faster/smaller

**Expected Output:**

- `.dockerignore` created to optimize builds

---

### Task 2.8: Commit Configuration Files

**Objective:** Commit all worker configuration files to the repository.

**Steps:**

1. Stage all new files:

   ```bash
   git add Dockerfile.worker \
           fly.staging.worker.toml \
           fly.staging.regenerator.toml \
           fly.prod.worker.toml \
           fly.prod.regenerator.toml \
           .dockerignore
   ```

2. Commit the files:

   ```bash
   git commit -m "feat: add Fly.io worker configuration and Dockerfile

   Add Docker and Fly.io configuration for deploying background workers:
   - Dockerfile.worker for both plan generation and regeneration workers
   - Fly.io config for staging plan generator
   - Fly.io config for staging plan regenerator
   - Fly.io config for production plan generator
   - Fly.io config for production plan regenerator
   - .dockerignore to optimize Docker builds

   Workers are configured with:
   - Shared CPU, 256MB RAM (starting resources)
   - Process health checks
   - Auto-restart on failure
   - Graceful shutdown support (already in worker code)
   "
   ```

3. Push to `main` branch:
   ```bash
   git push origin main
   ```

**Verification:**

- [ ] All files committed successfully
- [ ] Changes pushed to remote repository
- [ ] Files visible in GitHub repository

**Expected Output:**

- All worker configuration files committed and pushed to repository

---

## Phase Completion Checklist

- [ ] Task 2.1: Dockerfile.worker created
- [ ] Task 2.2: fly.staging.worker.toml created
- [ ] Task 2.3: fly.staging.regenerator.toml created
- [ ] Task 2.4: fly.prod.worker.toml created
- [ ] Task 2.5: fly.prod.regenerator.toml created
- [ ] Task 2.6: Docker build tested locally
- [ ] Task 2.7: .dockerignore created
- [ ] Task 2.8: All files committed and pushed

## Next Phase

Proceed to **Phase 3: Workflow Implementation** to create GitHub Actions workflows for automated deployments.

## Troubleshooting

**Issue:** Docker build fails with "pnpm: command not found"

- **Solution:** Ensure `corepack enable` and `corepack prepare pnpm@9` are in Dockerfile

**Issue:** Fly.io config validation fails

- **Solution:** Run `flyctl config validate -c fly.staging.worker.toml` to check for syntax errors

**Issue:** Docker build is very slow

- **Solution:** Ensure `.dockerignore` excludes `node_modules`, `.next`, and other large directories

**Issue:** Worker process exits immediately after starting

- **Solution:** Check that `src/workers/index.ts` and `src/workers/plan-regenerator.ts` exist and have correct entry points
