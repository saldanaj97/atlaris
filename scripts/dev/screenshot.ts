/**
 * Visual QA against the running dev server (`pnpm dev`): full-page screenshots
 * for each route at each width and color scheme, plus a horizontal-overflow check.
 *
 * Usage:
 *   pnpm exec tsx scripts/dev/screenshot.ts /dashboard /plans
 *   pnpm exec tsx scripts/dev/screenshot.ts --widths 375,1280 --themes dark /settings
 *
 * The base URL defaults to `portless get atlaris` (worktree-aware). Uses
 * Playwright Chromium when installed, otherwise the local Chrome.
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

type ColorScheme = 'dark' | 'light';

function resolveBaseUrl(explicit: string | undefined): string {
  if (explicit) return explicit.replace(/\/$/, '');
  // portless refuses to run when it sees pnpm/npm launcher variables.
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('npm_')) delete env[key];
  }
  try {
    return execFileSync('portless', ['get', 'atlaris'], {
      encoding: 'utf8',
      env,
    })
      .trim()
      .replace(/\/$/, '');
  } catch {
    throw new Error('Could not resolve the dev URL; pass --base <url>.');
  }
}

function parseList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function fileNameFor(route: string): string {
  return route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '_');
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      base: { type: 'string' },
      widths: { type: 'string', default: '375,768,1280' },
      themes: { type: 'string', default: 'dark,light' },
      out: { type: 'string', default: 'screenshots/qa' },
    },
  });

  const baseUrl = resolveBaseUrl(values.base);
  const routes = positionals.length > 0 ? positionals : ['/dashboard'];
  const widths = parseList(values.widths).map(Number);
  const themes = parseList(values.themes) as ColorScheme[];
  const outDir = path.resolve(values.out);
  mkdirSync(outDir, { recursive: true });

  // Prefer Playwright's Chromium; fall back to the installed Chrome.
  const browser = await chromium
    .launch()
    .catch(() => chromium.launch({ channel: 'chrome' }));
  let failures = 0;
  try {
    for (const theme of themes) {
      for (const width of widths) {
        const context = await browser.newContext({
          colorScheme: theme,
          ignoreHTTPSErrors: true,
          viewport: { width, height: 900 },
        });
        const page = await context.newPage();
        for (const route of routes) {
          const file = path.join(
            outDir,
            `${theme}-${width}-${fileNameFor(route)}.png`,
          );
          try {
            const response = await page.goto(baseUrl + route, {
              waitUntil: 'networkidle',
              timeout: 120_000,
            });
            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth > window.innerWidth,
            );
            await page.screenshot({ path: file, fullPage: true });
            const status = response?.status() ?? 'no response';
            console.log(
              `${theme} ${width} ${route} ${status}${overflow ? ' OVERFLOW' : ''} -> ${file}`,
            );
            if (overflow || (response?.status() ?? 500) >= 400) failures += 1;
          } catch (error) {
            failures += 1;
            console.log(`${theme} ${width} ${route} ERROR ${String(error)}`);
          }
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  if (failures > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
