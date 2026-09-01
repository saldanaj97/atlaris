/**
 * Decision helpers for the verify-atlaris supervisor.
 * Kept free of process/fs so unit tests can cover the review contracts.
 */

export type Mode = 'anon' | 'auth';

export type RunFile = {
  mode: Mode;
  url: string;
  port: number;
  supervisorPid: number;
  appPid: number | null;
  listenPid: number | null;
  containerId: string;
  stateFile: string;
};

export type ExistingLaunchDecision =
  | 'reuse'
  | 'reject-opposite-mode'
  | 'cleanup-stale';

export type DashboardProbe = {
  status: number;
  url: string;
  location: string | null;
};

export const SUPERVISOR_COMMAND_MARK = 'scripts/verify-atlaris/control.ts';
export const APP_COMMAND_MARK = 'scripts/tests/smoke/start-app.ts';

export function parseRunFile(raw: string): RunFile | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRunFile(value)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function resolveRunFileContents(
  primary: string | null,
  tmpCandidates: string[],
): RunFile | null {
  if (primary !== null) {
    const parsed = parseRunFile(primary);
    if (parsed) {
      return parsed;
    }
  }
  for (const raw of tmpCandidates) {
    const parsed = parseRunFile(raw);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

export function decideExistingLaunch(
  existingMode: Mode,
  requestedMode: Mode,
  doctorOk: boolean,
): ExistingLaunchDecision {
  if (!doctorOk) {
    return 'cleanup-stale';
  }
  if (existingMode === requestedMode) {
    return 'reuse';
  }
  return 'reject-opposite-mode';
}

export function recordedListenerPid(
  run: Pick<RunFile, 'listenPid'>,
): number | null {
  return run.listenPid;
}

export function isOwnedCommand(command: string | null, mark: string): boolean {
  return command !== null && command.includes(mark);
}

export function isOwnedListenerCommand(command: string | null): boolean {
  return (
    command !== null &&
    command.includes('next') &&
    (command.includes('dev') || command.includes('turbopack'))
  );
}

export function shouldTerminatePid(
  pid: number | null,
  selfPid: number,
  command: string | null,
  isOwned: (command: string | null) => boolean,
): pid is number {
  return pid !== null && pid !== selfPid && isOwned(command);
}

export function isExpectedDashboard(
  mode: Mode,
  probe: DashboardProbe,
  origin: string,
): boolean {
  if (mode === 'anon') {
    return (
      probe.status === 307 &&
      pathnameOf(probe.location, origin) === '/auth/sign-in'
    );
  }
  return (
    probe.status >= 200 &&
    probe.status < 300 &&
    pathnameOf(probe.url, origin) === '/dashboard'
  );
}

export function dashboardReadyWanted(mode: Mode): string {
  return mode === 'anon' ? '307 to /auth/sign-in' : '2xx on /dashboard';
}

function pathnameOf(value: string | null, base: string): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value, base).pathname;
  } catch {
    return null;
  }
}

function isRunFile(value: unknown): value is RunFile {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    (record.mode === 'anon' || record.mode === 'auth') &&
    typeof record.url === 'string' &&
    typeof record.port === 'number' &&
    Number.isFinite(record.port) &&
    typeof record.supervisorPid === 'number' &&
    Number.isFinite(record.supervisorPid) &&
    isOptionalPid(record.appPid) &&
    isOptionalPid(record.listenPid) &&
    typeof record.containerId === 'string' &&
    typeof record.stateFile === 'string'
  );
}

function isOptionalPid(value: unknown): value is number | null {
  return (
    value === null || (typeof value === 'number' && Number.isFinite(value))
  );
}
