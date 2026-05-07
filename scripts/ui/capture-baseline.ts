/**
 * Capture trustworthy UI baseline screenshots: fixed viewports, manifest, dimension checks.
 *
 * Default: disposable Postgres + anon (3100) + auth (3101) Next dev servers (same contract as smoke).
 * Optional: pass --anon-base= and --auth-base= to skip infra (servers must already serve matching modes).
 *
 * Usage:
 *   pnpm ui:capture-baseline
 *   pnpm ui:capture-baseline -- --out=screenshots/frontend-baseline-2026-04-27
 *   pnpm ui:capture-baseline -- --anon-base=http://127.0.0.1:3100 --auth-base=http://127.0.0.1:3101
 */
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { chromium, type BrowserContext, type Page } from '@playwright/test';

import { prepareSmokeDatabase } from '@tests/helpers/smoke/db-pipeline';
import {
  smokeAnonAppUrl,
  smokeAuthAppUrl,
} from '@tests/helpers/smoke/mode-config';
import {
  startSmokePostgresContainer,
  stopSmokePostgresContainer,
} from '@tests/helpers/smoke/postgres-container';
import {
  buildSmokeStatePayload,
  cleanupSmokeStateFile,
  createSmokeStateTempDir,
  SMOKE_STATE_FILE_ENV,
  writeSmokeStateFile,
} from '@tests/helpers/smoke/state-file';
import { assertSeededSmokeUserPresent } from '@tests/helpers/smoke/verify-seed';
import { parseCaptureBaselineArgs } from './capture-baseline-args';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

/**
 * Full-page screenshots may be slightly wider than viewport (scrollbar gutter / compositor).
 * `viewport` variant captures stay exact.
 */
const FULL_PAGE_WIDTH_TOLERANCE_PX = 24;

const VARIANTS = ['viewport', 'fullPage'] as const;

type Variant = (typeof VARIANTS)[number];

type BaseMode = 'anon' | 'auth';

/** Public routes: capture against anon app (unauthenticated). */
const ANON_ROUTES = [
  '/landing',
  '/about',
  '/pricing',
  '/auth/sign-in',
  '/auth/sign-up',
] as const;

/** Product routes: capture against auth-mode app (seeded dev user + local testing). */
const AUTH_ROUTES = [
  '/dashboard',
  '/plans',
  '/plans/new',
  '/analytics/usage',
  '/settings/profile',
] as const;

type CaptureManifestEntry = {
  route: string;
  base: BaseMode;
  viewport: string;
  variant: Variant;
  url: string;
  file: string;
  expectedWidth: number;
  expectedHeightMin: number;
  width: number;
  height: number;
  status: 'ok' | 'error';
  error?: string;
};

type CaptureRouteScreenshotInput = {
  context: BrowserContext;
  route: string;
  base: BaseMode;
  baseUrl: string;
  viewport: (typeof VIEWPORTS)[number];
  variant: Variant;
  outDir: string;
};

const SERVER_START_TIMEOUT_MS = 180_000;
const CAPTURE_GOTO_TIMEOUT_MS = 120_000;
const POLL_MS = 500;

function printHelp(): void {
  console.log(
    `
UI baseline capture

  pnpm ui:capture-baseline [ -- --out=DIR ] [ --anon-base=URL ] [ --auth-base=URL ]

Without --anon-base/--auth-base: starts disposable Postgres, migrates/seeds, runs Next dev on
  ${smokeAnonAppUrl()} (anon) and ${smokeAuthAppUrl()} (auth), then captures.

With both bases set: skips DB and server startup; URLs must already be reachable.

Output: DIR/*.png and DIR/manifest.json (gitignored under screenshots/).
`.trim(),
  );
}

function routeToFileSlug(route: string): string {
  return route.replace(/^\//, '').replace(/\//g, '-') || 'root';
}

function readPngDimensions(filePath: string): {
  width: number;
  height: number;
} {
  const buf = readFileSync(filePath);
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(pngSig)) {
    throw new Error(`Not a PNG or too small: ${filePath}`);
  }
  const type = buf.subarray(12, 16).toString('ascii');
  if (type !== 'IHDR') {
    throw new Error(`Expected IHDR chunk in ${filePath}`);
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

async function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  // Prefer root; follow redirects.
  const target = url.endsWith('/') ? url : `${url}/`;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(target, { redirect: 'follow' });
      if (res.ok) {
        return;
      }
    } catch {
      // Retry
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`Timeout waiting for OK response from ${target}`);
}

function killProcessGroupBestEffort(child: ChildProcess | null): void {
  if (!child?.pid) {
    return;
  }
  const pid = child.pid;
  try {
    if (process.platform !== 'win32') {
      process.kill(-pid, 'SIGTERM');
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // ignore
    }
  }
}

function spawnNextDev(
  mode: 'anon' | 'auth',
  stateFilePath: string,
): ChildProcess {
  const env = {
    ...process.env,
    [SMOKE_STATE_FILE_ENV]: stateFilePath,
  };
  return spawn(
    'pnpm',
    ['exec', 'tsx', 'scripts/tests/smoke/start-app.ts', `--mode=${mode}`],
    {
      cwd: process.cwd(),
      env,
      detached: process.platform !== 'win32',
      stdio: 'ignore',
    },
  );
}

function validateViewportDimensionsDistinct(
  entries: CaptureManifestEntry[],
): void {
  const viewportOnly = entries.filter(
    (e) => e.variant === 'viewport' && e.status === 'ok',
  );
  const widths = new Set(viewportOnly.map((e) => e.width));
  // All three viewports must appear with different widths at least once
  const expectedWidths = new Set(VIEWPORTS.map((v) => v.width));
  for (const w of expectedWidths) {
    if (!widths.has(w)) {
      throw new Error(
        `Baseline validation: no successful viewport capture at width ${w} — mobile/tablet/desktop collapsed or all captures failed`,
      );
    }
  }
}

function validateViewportVariantSize(
  entry: CaptureManifestEntry,
  vp: { width: number; height: number },
): void {
  if (entry.status !== 'ok' || entry.variant !== 'viewport') {
    return;
  }
  if (entry.width !== vp.width || entry.height !== vp.height) {
    throw new Error(
      `Baseline validation: ${entry.file} expected ${vp.width}x${vp.height}, got ${entry.width}x${entry.height}`,
    );
  }
}

function validateFullPageWidth(
  entry: CaptureManifestEntry,
  vp: { width: number },
): void {
  if (entry.status !== 'ok' || entry.variant !== 'fullPage') {
    return;
  }
  if (
    entry.width < vp.width ||
    entry.width > vp.width + FULL_PAGE_WIDTH_TOLERANCE_PX
  ) {
    throw new Error(
      `Baseline validation: fullPage ${entry.file} expected width in [${vp.width}, ${vp.width + FULL_PAGE_WIDTH_TOLERANCE_PX}], got ${entry.width}`,
    );
  }
}

async function hideDevelopmentCaptureArtifacts(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
nextjs-portal,
[data-nextjs-dev-tools-button] {
	visibility: hidden !important;
}
`,
  });
}

async function captureRouteScreenshot({
  context,
  route,
  base,
  baseUrl,
  viewport,
  variant,
  outDir,
}: CaptureRouteScreenshotInput): Promise<CaptureManifestEntry> {
  const url = `${baseUrl}${route}`;
  const slug = routeToFileSlug(route);
  const file = `${slug}--${base}--${viewport.name}--${variant}.png`;
  const filePath = join(outDir, file);
  const entry: CaptureManifestEntry = {
    route,
    base,
    viewport: viewport.name,
    variant,
    url,
    file,
    expectedWidth: viewport.width,
    expectedHeightMin: viewport.height,
    width: 0,
    height: 0,
    status: 'ok',
  };
  const page = await context.newPage();

  try {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: CAPTURE_GOTO_TIMEOUT_MS,
    });
    await hideDevelopmentCaptureArtifacts(page);
    await page.screenshot({
      path: filePath,
      fullPage: variant === 'fullPage',
      scale: 'css',
    });
    const dims = readPngDimensions(filePath);
    entry.width = dims.width;
    entry.height = dims.height;
    validateViewportVariantSize(entry, viewport);
    validateFullPageWidth(entry, viewport);
  } catch (err) {
    entry.status = 'error';
    entry.error = err instanceof Error ? err.message : String(err);
  } finally {
    await page.close();
  }

  return entry;
}

type BaselineInfraHandles = {
  container: StartedPostgreSqlContainer | null;
  stateFilePath: string | null;
  tempDir: string | null;
  anonChild: ChildProcess | null;
  authChild: ChildProcess | null;
};

function createEmptyBaselineInfraHandles(): BaselineInfraHandles {
  return {
    container: null,
    stateFilePath: null,
    tempDir: null,
    anonChild: null,
    authChild: null,
  };
}

async function startBaselineInfraIfNeeded(
  skipInfra: boolean,
  anonUrl: string,
  authUrl: string,
  handles: BaselineInfraHandles,
): Promise<void> {
  if (!skipInfra) {
    handles.tempDir = createSmokeStateTempDir();
    handles.container = await startSmokePostgresContainer();
    const connectionUrl = handles.container.getConnectionUri();
    await prepareSmokeDatabase(connectionUrl);
    handles.stateFilePath = writeSmokeStateFile(
      handles.tempDir,
      buildSmokeStatePayload(connectionUrl),
    );
    process.env[SMOKE_STATE_FILE_ENV] = handles.stateFilePath;
    await assertSeededSmokeUserPresent(connectionUrl);

    console.log('[baseline] Starting Next dev (anon + auth)…');
    handles.anonChild = spawnNextDev('anon', handles.stateFilePath);
    handles.authChild = spawnNextDev('auth', handles.stateFilePath);

    await waitForHttpOk(anonUrl, SERVER_START_TIMEOUT_MS);
    await waitForHttpOk(authUrl, SERVER_START_TIMEOUT_MS);
    console.log('[baseline] Servers ready.');
    return;
  }

  console.log('[baseline] Using existing servers (no infra).');
  await waitForHttpOk(anonUrl, 30_000);
  await waitForHttpOk(authUrl, 30_000);
}

async function captureAllBaselineScreenshots({
  anonUrl,
  authUrl,
  resolvedOut,
}: {
  anonUrl: string;
  authUrl: string;
  resolvedOut: string;
}): Promise<CaptureManifestEntry[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  try {
    const manifestEntries: CaptureManifestEntry[] = [];

    for (const vp of VIEWPORTS) {
      for (const variant of VARIANTS) {
        for (const route of ANON_ROUTES) {
          manifestEntries.push(
            await captureRouteScreenshot({
              context,
              route,
              base: 'anon',
              baseUrl: anonUrl,
              viewport: vp,
              variant,
              outDir: resolvedOut,
            }),
          );
        }

        for (const route of AUTH_ROUTES) {
          manifestEntries.push(
            await captureRouteScreenshot({
              context,
              route,
              base: 'auth',
              baseUrl: authUrl,
              viewport: vp,
              variant,
              outDir: resolvedOut,
            }),
          );
        }
      }
    }

    return manifestEntries;
  } finally {
    await browser.close();
  }
}

function writeBaselineManifestOrThrow({
  manifestEntries,
  resolvedOut,
  anonUrl,
  authUrl,
  skipInfra,
}: {
  manifestEntries: CaptureManifestEntry[];
  resolvedOut: string;
  anonUrl: string;
  authUrl: string;
  skipInfra: boolean;
}): void {
  validateViewportDimensionsDistinct(manifestEntries);

  const failed = manifestEntries.filter((e) => e.status === 'error');
  const manifest = {
    generatedAt: new Date().toISOString(),
    outDir: resolvedOut,
    viewports: VIEWPORTS,
    variants: VARIANTS,
    anonBase: anonUrl,
    authBase: authUrl,
    skipInfra,
    captures: manifestEntries,
  };
  writeFileSync(
    join(resolvedOut, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  console.log(
    `[baseline] Wrote ${manifestEntries.length} entries under ${resolvedOut}`,
  );
  if (failed.length > 0) {
    console.error('[baseline] Failures:');
    for (const f of failed) {
      console.error(`  ${f.file}: ${f.error}`);
    }
    process.exitCode = 1;
  }
}

async function cleanupBaselineInfra(
  handles: BaselineInfraHandles,
): Promise<void> {
  killProcessGroupBestEffort(handles.anonChild);
  killProcessGroupBestEffort(handles.authChild);
  await stopSmokePostgresContainer(handles.container);
  if (handles.stateFilePath !== null) {
    cleanupSmokeStateFile(handles.stateFilePath);
  }
  if (handles.tempDir !== null) {
    try {
      rmSync(handles.tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function main(): Promise<void> {
  const { outDir, anonBase, authBase, help } = parseCaptureBaselineArgs(
    process.argv.slice(2),
  );
  if (help) {
    printHelp();
    return;
  }

  const skipInfra = anonBase !== null && authBase !== null;
  const skipInfraPartial = (anonBase !== null) !== (authBase !== null);
  if (skipInfraPartial) {
    console.error('Provide both --anon-base= and --auth-base= or neither.');
    process.exitCode = 1;
    return;
  }

  const resolvedOut = resolve(process.cwd(), outDir);
  mkdirSync(resolvedOut, { recursive: true });

  const handles = createEmptyBaselineInfraHandles();

  const anonUrl = skipInfra ? anonBase! : smokeAnonAppUrl();
  const authUrl = skipInfra ? authBase! : smokeAuthAppUrl();

  try {
    await startBaselineInfraIfNeeded(skipInfra, anonUrl, authUrl, handles);

    const manifestEntries = await captureAllBaselineScreenshots({
      anonUrl,
      authUrl,
      resolvedOut,
    });

    writeBaselineManifestOrThrow({
      manifestEntries,
      resolvedOut,
      anonUrl,
      authUrl,
      skipInfra,
    });
  } finally {
    await cleanupBaselineInfra(handles);
  }
}

main().catch((err: unknown) => {
  console.error('[baseline] Fatal:', err);
  process.exitCode = 1;
});
