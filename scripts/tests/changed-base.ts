import { pathToFileURL } from 'node:url';

const DEFAULT_CHANGED_TEST_BASE = 'origin/develop';

export type ChangedTestBaseEnv = {
  BASE_REF?: string;
  VITEST_CHANGED_BASE?: string;
};

function normalizeBaseRef(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readProcessEnv(): ChangedTestBaseEnv {
  return {
    BASE_REF: process.env.BASE_REF,
    VITEST_CHANGED_BASE: process.env.VITEST_CHANGED_BASE,
  };
}

export function resolveChangedTestBase(
  env: ChangedTestBaseEnv = readProcessEnv(),
): string {
  return (
    normalizeBaseRef(env.VITEST_CHANGED_BASE) ??
    normalizeBaseRef(env.BASE_REF) ??
    DEFAULT_CHANGED_TEST_BASE
  );
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isDirectExecution()) {
  console.log(resolveChangedTestBase());
}
