import {
  CheckGateUsageError,
  parseArgs,
  parseCsp,
  runGateChecks,
  type ProbeResult,
} from '../../../scripts/launch/check-gate';
import { describe, expect, it } from 'vitest';

const ORIGIN = 'https://atlaris.app';

function redirect(path: string): ProbeResult {
  return { status: 307, location: `${ORIGIN}${path}`, csp: {} };
}

function page(csp: Record<string, string> = {}): ProbeResult {
  return { status: 200, location: null, csp };
}

const PROTECT_CSP = {
  'script-src': "'self' https://*.protect.clerk.com",
  'frame-src': "'self' https://*.protect.clerk.com",
};

function probeFrom(routes: Record<string, ProbeResult>) {
  return async (path: string) => {
    const result = routes[path];
    if (result === undefined) throw new Error(`unexpected probe ${path}`);
    return result;
  };
}

const GATE_ON = {
  '/dashboard': redirect('/waitlist'),
  '/auth/sign-up': redirect('/waitlist?from=sign-up'),
  '/waitlist': page(),
  '/plans/new': redirect('/waitlist'),
  '/pricing': page(),
};

const GATE_OFF = {
  '/dashboard': redirect('/auth/sign-in?redirect_url=/dashboard'),
  '/auth/sign-up': page(PROTECT_CSP),
  '/waitlist': redirect('/'),
  '/plans/new': redirect('/auth/sign-up?redirect_url=/plans/new'),
  '/pricing': page(),
};

describe('check-gate', () => {
  it('passes every check when the gate is on and expected on', async () => {
    const outcomes = await runGateChecks(probeFrom(GATE_ON), 'on');
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
  });

  it('passes every check when the gate is off and expected off', async () => {
    const outcomes = await runGateChecks(probeFrom(GATE_OFF), 'off');
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
  });

  it('fails the off checks while the waitlist is still on', async () => {
    const outcomes = await runGateChecks(probeFrom(GATE_ON), 'off');
    expect(outcomes.filter((o) => !o.ok).length).toBeGreaterThanOrEqual(4);
  });

  it('fails the on checks once the waitlist is off', async () => {
    const outcomes = await runGateChecks(probeFrom(GATE_OFF), 'on');
    expect(outcomes.some((o) => !o.ok)).toBe(true);
  });

  it('fails when sign-up loses the Clerk bot-protection CSP', async () => {
    const outcomes = await runGateChecks(
      probeFrom({
        ...GATE_OFF,
        '/auth/sign-up': page({ 'script-src': "'self'" }),
      }),
      'off',
    );
    expect(outcomes.filter((o) => !o.ok).map((o) => o.name)).toEqual([
      '/auth/sign-up CSP allows *.protect.clerk.com in script-src and frame-src',
    ]);
  });

  it('parses CSP directives by name', () => {
    expect(
      parseCsp("default-src 'self'; frame-src https://a https://b"),
    ).toEqual({
      'default-src': "'self'",
      'frame-src': 'https://a https://b',
    });
    expect(parseCsp(null)).toEqual({});
  });

  it('parses arguments and rejects bad ones', () => {
    expect(parseArgs(['--expect', 'off', '--wait', '30'])).toEqual({
      expect: 'off',
      baseUrl: 'https://atlaris.app',
      waitSeconds: 30,
    });
    expect(() => parseArgs([])).toThrow(CheckGateUsageError);
    expect(() => parseArgs(['--expect', 'maybe'])).toThrow(CheckGateUsageError);
    expect(() => parseArgs(['--expect', 'on', '--base-url', 'nope'])).toThrow(
      CheckGateUsageError,
    );
  });
});
