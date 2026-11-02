// Bundler and dev-server settings for the atlaris-jobs Worker; the Worker
// itself is defined in cloudflare.config.ts.
import { defineWranglerConfig } from 'wrangler/experimental-config';

// `cf dev` takes no inspector flag. `pnpm workers dev` (scripts/workers/cli.ts)
// sets this per worktree so several worktrees can run the Worker at once.
const inspectorPort = Number(process.env.ATLARIS_JOBS_DEV_INSPECTOR_PORT);

export default defineWranglerConfig({
  // Worker replacement for the Next-only Sentry SDK on job paths
  // (design note, "Runtime compatibility audit").
  alias: {
    '@sentry/nextjs': '@sentry/cloudflare',
  },
  tsconfig: './tsconfig.json',
  // Only `pnpm workers types` writes .cloudflare/types/index.d.ts (committed; CI
  // diffs it). `cf dev` and `cf workers check` bundle wrangler's own workerd types,
  // which differ, so they must not rewrite the file.
  types: { generate: false },
  dev: {
    // `cf dev --host` sets the upstream host, not the listen address.
    ip: '127.0.0.1',
    ...(inspectorPort > 0 ? { inspectorPort } : {}),
  },
});
