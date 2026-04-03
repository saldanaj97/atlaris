/**
 * Ephemeral smoke DB connection state passed from `scripts/smoke/run.ts` to child
 * processes (launchers, later Playwright). Stored outside the repo under `os.tmpdir()`.
 *
 * We do **not** include `ALLOW_DB_TRUNCATE` here: that flag is for Vitest integration
 * helpers that truncate tables. Browser smoke does not use those helpers.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SMOKE_STATE_FILE_ENV = 'SMOKE_STATE_FILE' as const;

export type SmokeStatePayload = {
  DATABASE_URL: string;
  DATABASE_URL_NON_POOLING: string;
  DATABASE_URL_UNPOOLED: string;
};

const REQUIRED_KEYS: readonly (keyof SmokeStatePayload)[] = [
  'DATABASE_URL',
  'DATABASE_URL_NON_POOLING',
  'DATABASE_URL_UNPOOLED',
];

export interface SmokeStateFileDeps {
  fs: {
    mkdtempSync: (prefix: string) => string;
    readFileSync: (filePath: string, encoding: BufferEncoding) => string;
    unlinkSync: (filePath: string) => void;
    writeFileSync: (
      filePath: string,
      data: string,
      encoding: BufferEncoding
    ) => void;
  };
  tempDirParent: string;
  createId: () => string;
}

const DEFAULT_DEPS: SmokeStateFileDeps = {
  fs: {
    mkdtempSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
  },
  tempDirParent: tmpdir(),
  createId: () => randomUUID(),
};

function resolveDeps(
  overrides: Partial<SmokeStateFileDeps> = {}
): SmokeStateFileDeps {
  return {
    ...DEFAULT_DEPS,
    ...overrides,
    fs: {
      ...DEFAULT_DEPS.fs,
      ...overrides.fs,
    },
  };
}

function validatePayload(raw: unknown): SmokeStatePayload {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Smoke state file: expected a JSON object');
  }
  const record = raw as Record<string, unknown>;
  for (const key of REQUIRED_KEYS) {
    const value = record[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Smoke state file: missing or invalid "${key}"`);
    }
  }
  return {
    DATABASE_URL: record.DATABASE_URL as string,
    DATABASE_URL_NON_POOLING: record.DATABASE_URL_NON_POOLING as string,
    DATABASE_URL_UNPOOLED: record.DATABASE_URL_UNPOOLED as string,
  };
}

export function buildSmokeStatePayload(
  connectionUrl: string,
  _deps?: Partial<SmokeStateFileDeps>
): SmokeStatePayload {
  return {
    DATABASE_URL: connectionUrl,
    DATABASE_URL_NON_POOLING: connectionUrl,
    DATABASE_URL_UNPOOLED: connectionUrl,
  };
}

/**
 * Writes JSON state to `dir` and returns the absolute file path.
 */
export function writeSmokeStateFile(
  dir: string,
  payload: SmokeStatePayload,
  deps?: Partial<SmokeStateFileDeps>
): string {
  const resolvedDeps = resolveDeps(deps);
  const filePath = join(dir, `smoke-state-${resolvedDeps.createId()}.json`);
  resolvedDeps.fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8');
  return filePath;
}

export function readSmokeStateFromPath(
  filePath: string,
  deps?: Partial<SmokeStateFileDeps>
): SmokeStatePayload {
  const resolvedDeps = resolveDeps(deps);
  let raw: string;
  try {
    raw = resolvedDeps.fs.readFileSync(filePath, 'utf8');
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Smoke state file: cannot read "${filePath}": ${message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Smoke state file: invalid JSON in "${filePath}"`);
  }
  return validatePayload(parsed);
}

export function readSmokeStateFromEnv(): SmokeStatePayload {
  const filePath = process.env[SMOKE_STATE_FILE_ENV];
  if (filePath === undefined || filePath.trim() === '') {
    throw new Error(
      `Smoke state: ${SMOKE_STATE_FILE_ENV} is not set or is empty`
    );
  }
  return readSmokeStateFromPath(filePath);
}

export function createSmokeStateTempDir(
  deps?: Partial<SmokeStateFileDeps>
): string {
  const resolvedDeps = resolveDeps(deps);
  return resolvedDeps.fs.mkdtempSync(
    join(resolvedDeps.tempDirParent, 'atlaris-smoke-')
  );
}

export function cleanupSmokeStateFile(
  filePath: string,
  deps?: Partial<SmokeStateFileDeps>
): void {
  const resolvedDeps = resolveDeps(deps);
  try {
    resolvedDeps.fs.unlinkSync(filePath);
  } catch {
    // File may already be gone
  }
}
