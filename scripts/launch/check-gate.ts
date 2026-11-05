import { pathToFileURL } from 'node:url';

/**
 * Read-only probe of the site gate on a deployed Atlaris origin
 * (docs/testing/launch-smoke-checklist.md). It sends signed-out GETs with
 * redirects off, so it needs no credentials and changes nothing.
 *
 *   pnpm launch:check-gate --expect on  [--base-url https://atlaris.app]
 *   pnpm launch:check-gate --expect off --wait 180
 *
 * `--wait <seconds>` re-runs every 10 s until every check passes, which covers
 * Flagship propagation plus the 60 s gate cache after a flag change.
 */

export type GateState = 'on' | 'off';

export interface ProbeResult {
  readonly status: number;
  /** Redirect target, resolved against the probed URL. */
  readonly location: string | null;
  /** `script-src` and `frame-src` directives of the CSP header, by name. */
  readonly csp: Readonly<Record<string, string>>;
}

export interface CheckOutcome {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

type Probe = (path: string) => Promise<ProbeResult>;

const DEFAULT_BASE_URL = 'https://atlaris.app';
const POLL_INTERVAL_MS = 10_000;
const PROTECT_HOST = '*.protect.clerk.com';

export class CheckGateUsageError extends Error {}

export function parseCsp(header: string | null): Record<string, string> {
  const directives: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives[name] = sources.join(' ');
  }
  return directives;
}

function pathOf(location: string | null): string | null {
  if (location === null) return null;
  const url = new URL(location);
  return url.pathname + url.search;
}

const isRedirect = (status: number): boolean => status >= 300 && status < 400;

function check(name: string, ok: boolean, detail: string): CheckOutcome {
  return { name, ok, detail };
}

function describe(result: ProbeResult): string {
  return result.location === null
    ? `${result.status}`
    : `${result.status} -> ${pathOf(result.location)}`;
}

/** Runs every gate check for `expect` against `probe`. */
export async function runGateChecks(
  probe: Probe,
  expect: GateState,
): Promise<CheckOutcome[]> {
  const [dashboard, signUp, waitlist, newPlan, pricing] = await Promise.all([
    probe('/dashboard'),
    probe('/auth/sign-up'),
    probe('/waitlist'),
    probe('/plans/new'),
    probe('/pricing'),
  ]);
  const toWaitlist = (r: ProbeResult) =>
    isRedirect(r.status) &&
    pathOf(r.location)?.startsWith('/waitlist') === true;

  if (expect === 'on') {
    return [
      check(
        '/dashboard redirects to /waitlist',
        toWaitlist(dashboard),
        describe(dashboard),
      ),
      check(
        '/auth/sign-up redirects to /waitlist?from=sign-up',
        toWaitlist(signUp) &&
          pathOf(signUp.location)?.includes('from=sign-up') === true,
        describe(signUp),
      ),
      check(
        '/plans/new redirects to /waitlist',
        toWaitlist(newPlan),
        describe(newPlan),
      ),
      check(
        '/waitlist answers 200',
        waitlist.status === 200,
        describe(waitlist),
      ),
      check('/pricing answers 200', pricing.status === 200, describe(pricing)),
    ];
  }

  const csp = signUp.csp;
  const protectAllowed = (directive: string) =>
    (csp[directive] ?? '').split(' ').includes(`https://${PROTECT_HOST}`);
  const newPlanPath = pathOf(newPlan.location);
  return [
    check(
      '/dashboard no longer redirects to /waitlist',
      !toWaitlist(dashboard),
      describe(dashboard),
    ),
    check(
      '/auth/sign-up answers 200 (not /waitlist)',
      signUp.status === 200,
      describe(signUp),
    ),
    check(
      `/auth/sign-up CSP allows ${PROTECT_HOST} in script-src and frame-src`,
      protectAllowed('script-src') && protectAllowed('frame-src'),
      `script-src ${protectAllowed('script-src')}, frame-src ${protectAllowed('frame-src')}`,
    ),
    check(
      '/plans/new (signed out) redirects to /auth/sign-up?redirect_url=/plans/new',
      isRedirect(newPlan.status) &&
        newPlanPath?.startsWith('/auth/sign-up') === true &&
        newPlanPath.includes('redirect_url='),
      describe(newPlan),
    ),
    check(
      '/waitlist redirects away (hosted: home)',
      isRedirect(waitlist.status) && !toWaitlist(waitlist),
      describe(waitlist),
    ),
    check('/pricing answers 200', pricing.status === 200, describe(pricing)),
  ];
}

export function parseArgs(argv: readonly string[]): {
  expect: GateState;
  baseUrl: string;
  waitSeconds: number;
} {
  let expect: string | undefined;
  let baseUrl = DEFAULT_BASE_URL;
  let waitSeconds = 0;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--expect') expect = value;
    else if (flag === '--base-url') baseUrl = value ?? '';
    else if (flag === '--wait') waitSeconds = Number(value);
    else throw new CheckGateUsageError(`Unknown argument: ${flag}`);
    i += 1;
  }
  if (expect !== 'on' && expect !== 'off') {
    throw new CheckGateUsageError('Pass --expect on|off.');
  }
  if (!Number.isFinite(waitSeconds) || waitSeconds < 0) {
    throw new CheckGateUsageError('--wait takes a number of seconds.');
  }
  try {
    void new URL(baseUrl);
  } catch {
    throw new CheckGateUsageError(`--base-url is not a URL: ${baseUrl}`);
  }
  return { expect, baseUrl, waitSeconds };
}

function httpProbe(baseUrl: string): Probe {
  return async (path) => {
    const url = new URL(path, baseUrl);
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    const location = response.headers.get('location');
    return {
      status: response.status,
      location: location === null ? null : new URL(location, url).href,
      csp: parseCsp(response.headers.get('content-security-policy')),
    };
  };
}

export async function runCheckGate(argv: readonly string[]): Promise<number> {
  const { expect, baseUrl, waitSeconds } = parseArgs(argv);
  const probe = httpProbe(baseUrl);
  const deadline = Date.now() + waitSeconds * 1000;
  for (;;) {
    const outcomes = await runGateChecks(probe, expect).catch(
      (error: unknown): CheckOutcome[] => [
        check(
          'origin reachable',
          false,
          error instanceof Error ? error.message : String(error),
        ),
      ],
    );
    const failed = outcomes.filter((outcome) => !outcome.ok);
    if (failed.length === 0 || Date.now() + POLL_INTERVAL_MS > deadline) {
      console.log(`Gate expected ${expect.toUpperCase()} on ${baseUrl}`);
      for (const { ok, name, detail } of outcomes) {
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  [${detail}]`);
      }
      return failed.length === 0 ? 0 : 1;
    }
    console.log(
      `${failed.length} check(s) not yet ${expect}; retrying in ${POLL_INTERVAL_MS / 1000} s`,
    );
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isDirectExecution()) {
  runCheckGate(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(
        error instanceof CheckGateUsageError ? error.message : error,
      );
      process.exitCode = 2;
    },
  );
}
