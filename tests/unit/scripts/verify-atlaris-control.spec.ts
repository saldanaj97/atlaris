import {
  dashboardReadyWanted,
  decideExistingLaunch,
  isExpectedDashboard,
  isOwnedCommand,
  isOwnedListenerCommand,
  parseRunFile,
  recordedListenerPid,
  resolveRunFileContents,
  shouldTerminatePid,
  SUPERVISOR_COMMAND_MARK,
  type RunFile,
} from '../../../scripts/verify-atlaris/control-logic';
import { describe, expect, it } from 'vitest';

const run: RunFile = {
  mode: 'anon',
  url: 'http://127.0.0.1:3100',
  port: 3100,
  supervisorPid: 11,
  appPid: 22,
  listenPid: 33,
  containerId: 'abc',
  stateFile: '/tmp/state.json',
};

describe('decideExistingLaunch', () => {
  it('reuses a healthy same-mode run', () => {
    expect(decideExistingLaunch('anon', 'anon', true)).toBe('reuse');
  });

  it('rejects a healthy opposite-mode run instead of treating it as stale', () => {
    expect(decideExistingLaunch('anon', 'auth', true)).toBe(
      'reject-opposite-mode',
    );
    expect(decideExistingLaunch('auth', 'anon', true)).toBe(
      'reject-opposite-mode',
    );
  });

  it('cleans only when doctor failed', () => {
    expect(decideExistingLaunch('anon', 'auth', false)).toBe('cleanup-stale');
    expect(decideExistingLaunch('auth', 'auth', false)).toBe('cleanup-stale');
  });
});

describe('recordedListenerPid', () => {
  it('never falls back to the current port owner', () => {
    expect(recordedListenerPid({ listenPid: null })).toBeNull();
    expect(recordedListenerPid({ listenPid: 33 })).toBe(33);
  });
});

describe('shouldTerminatePid', () => {
  it('requires recorded identity before killing supervisor or listener', () => {
    expect(
      shouldTerminatePid(
        11,
        99,
        'tsx scripts/verify-atlaris/control.ts launch',
        (command) => isOwnedCommand(command, SUPERVISOR_COMMAND_MARK),
      ),
    ).toBe(true);
    expect(
      shouldTerminatePid(11, 99, '/usr/bin/nginx', (command) =>
        isOwnedCommand(command, SUPERVISOR_COMMAND_MARK),
      ),
    ).toBe(false);
    expect(
      shouldTerminatePid(
        33,
        99,
        'next dev --turbopack',
        isOwnedListenerCommand,
      ),
    ).toBe(true);
    expect(
      shouldTerminatePid(
        33,
        99,
        'python -m http.server',
        isOwnedListenerCommand,
      ),
    ).toBe(false);
    expect(
      shouldTerminatePid(
        null,
        99,
        'next dev --turbopack',
        isOwnedListenerCommand,
      ),
    ).toBe(false);
  });
});

describe('isExpectedDashboard', () => {
  it('requires anon 307 to /auth/sign-in', () => {
    expect(
      isExpectedDashboard(
        'anon',
        {
          status: 307,
          url: 'http://127.0.0.1:3100/dashboard',
          location: '/auth/sign-in?redirect_url=%2Fdashboard',
        },
        'http://127.0.0.1:3100',
      ),
    ).toBe(true);
    expect(
      isExpectedDashboard(
        'anon',
        {
          status: 307,
          url: 'http://127.0.0.1:3100/dashboard',
          location: '/maintenance',
        },
        'http://127.0.0.1:3100',
      ),
    ).toBe(false);
    expect(
      isExpectedDashboard(
        'anon',
        {
          status: 200,
          url: 'http://127.0.0.1:3100/auth/sign-in',
          location: null,
        },
        'http://127.0.0.1:3100',
      ),
    ).toBe(false);
  });

  it('requires auth to finish 2xx on /dashboard', () => {
    expect(
      isExpectedDashboard(
        'auth',
        {
          status: 200,
          url: 'http://127.0.0.1:3101/dashboard',
          location: null,
        },
        'http://127.0.0.1:3101',
      ),
    ).toBe(true);
    expect(
      isExpectedDashboard(
        'auth',
        {
          status: 200,
          url: 'http://127.0.0.1:3101/auth/sign-in',
          location: null,
        },
        'http://127.0.0.1:3101',
      ),
    ).toBe(false);
    expect(
      isExpectedDashboard(
        'auth',
        {
          status: 307,
          url: 'http://127.0.0.1:3101/dashboard',
          location: '/dashboard',
        },
        'http://127.0.0.1:3101',
      ),
    ).toBe(false);
    expect(dashboardReadyWanted('auth')).toBe('2xx on /dashboard');
  });
});

describe('parseRunFile', () => {
  it('treats empty or truncated JSON as recoverable miss', () => {
    expect(parseRunFile('')).toBeNull();
    expect(parseRunFile('{')).toBeNull();
    expect(parseRunFile('{"mode":"anon"}')).toBeNull();
  });

  it('recovers a complete record and prefers the primary over tmp leftovers', () => {
    const raw = `${JSON.stringify(run)}\n`;
    expect(parseRunFile(raw)).toEqual(run);
    expect(resolveRunFileContents('{', [raw])).toEqual(run);
    expect(
      resolveRunFileContents(raw, [`${JSON.stringify({ ...run, port: 9 })}`]),
    ).toEqual(run);
    expect(resolveRunFileContents(null, ['{', raw])).toEqual(run);
    expect(resolveRunFileContents('{', ['{'])).toBeNull();
  });
});
