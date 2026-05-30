import type { PlaywrightTestConfig } from '@playwright/test';

import { defineConfig } from '@playwright/test';

const SMOKE_ANON_BASE_URL = 'http://127.0.0.1:3100';
const SMOKE_AUTH_BASE_URL = 'http://127.0.0.1:3101';
const PLAYWRIGHT_REPORT_DIR =
  './tests/test-results/playwright/playwright-report';
const PLAYWRIGHT_OUTPUT_DIR = './tests/test-results/playwright/artifacts';
const SMOKE_SERVER_TIMEOUT_MS = 180_000;
const SMOKE_SERVER_SHUTDOWN = { signal: 'SIGTERM' as const, timeout: 5_000 };

type SmokeServerName = 'anon' | 'auth';
type SmokeWebServer = Extract<
  NonNullable<PlaywrightTestConfig['webServer']>,
  unknown[]
>[number];

const SMOKE_WEB_SERVERS: Record<SmokeServerName, SmokeWebServer> = {
  anon: {
    command: 'pnpm exec tsx scripts/tests/smoke/start-app.ts --mode=anon',
    gracefulShutdown: SMOKE_SERVER_SHUTDOWN,
    reuseExistingServer: false,
    timeout: SMOKE_SERVER_TIMEOUT_MS,
    url: SMOKE_ANON_BASE_URL,
  },
  auth: {
    command: 'pnpm exec tsx scripts/tests/smoke/start-app.ts --mode=auth',
    gracefulShutdown: SMOKE_SERVER_SHUTDOWN,
    reuseExistingServer: false,
    timeout: SMOKE_SERVER_TIMEOUT_MS,
    url: SMOKE_AUTH_BASE_URL,
  },
};

// Each project only needs one app server. smoke-anon and smoke-clerk both run
// against the anonymous server (:3100); smoke-auth runs against the auth
// server (:3101).
const PROJECT_SERVER_NEEDS: Record<string, SmokeServerName> = {
  'smoke-anon': 'anon',
  'smoke-clerk': 'anon',
  'smoke-auth': 'auth',
};

function selectedProjectsFromArgv(argv: string[]): string[] {
  const projects: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--project') {
      const value = argv[i + 1];
      if (value !== undefined && !value.startsWith('-')) {
        projects.push(value);
      }
    } else if (arg.startsWith('--project=')) {
      projects.push(arg.slice('--project='.length));
    }
  }
  return projects;
}

// Only boot the Next dev server(s) the selected --project actually needs.
// Booting both Turbopack servers at once is the dominant memory cost of a smoke
// run, so a single-project invocation should never pay for the other server.
// With no project filter (full run) we keep both servers for backwards compat.
function resolveSmokeWebServers(): SmokeWebServer[] {
  const selectedProjects = selectedProjectsFromArgv(process.argv);
  const needed = new Set<SmokeServerName>(
    selectedProjects
      .map((name) => PROJECT_SERVER_NEEDS[name])
      .filter((server): server is SmokeServerName => server !== undefined),
  );

  // No recognized project filter -> start everything (full-run default).
  if (needed.size === 0) {
    return [SMOKE_WEB_SERVERS.anon, SMOKE_WEB_SERVERS.auth];
  }

  const servers: SmokeWebServer[] = [];
  if (needed.has('anon')) {
    servers.push(SMOKE_WEB_SERVERS.anon);
  }
  if (needed.has('auth')) {
    servers.push(SMOKE_WEB_SERVERS.auth);
  }
  return servers;
}

export default defineConfig({
  testDir: './tests/playwright/smoke',
  timeout: 180_000,
  outputDir: PLAYWRIGHT_OUTPUT_DIR,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: PLAYWRIGHT_REPORT_DIR }],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  fullyParallel: false,
  webServer: resolveSmokeWebServers(),
  projects: [
    {
      name: 'smoke-anon',
      testMatch: /anon\.redirects\.spec\.ts/,
      use: {
        baseURL: SMOKE_ANON_BASE_URL,
      },
    },
    {
      name: 'smoke-auth',
      testMatch: /auth\.(?!clerk\.).*\.spec\.ts/,
      workers: 1,
      use: {
        baseURL: SMOKE_AUTH_BASE_URL,
      },
    },
    {
      name: 'smoke-clerk',
      testMatch: /auth\.clerk\.spec\.ts/,
      use: {
        baseURL: SMOKE_ANON_BASE_URL,
      },
    },
  ],
});
