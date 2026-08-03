import { moduleLessonGeneration } from '@/flags';

let testOverride: boolean | undefined;

/** Test hook: force enablement without evaluating the Vercel Flag. */
export function setModuleLessonGenerationEnabledForTests(
  value: boolean | undefined,
): void {
  testOverride = value;
}

function readLessonGenerationEnabledEnv(): boolean | undefined {
  const raw = process.env.LESSON_GENERATION_ENABLED;
  if (raw === undefined) {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  return undefined;
}

/** Fail closed when the Vercel Flag cannot be evaluated. */
export async function resolveModuleLessonGenerationEnabled(): Promise<boolean> {
  if (testOverride !== undefined) {
    return testOverride;
  }

  const envOverride = readLessonGenerationEnabledEnv();
  if (envOverride !== undefined) {
    return envOverride;
  }

  try {
    return Boolean(await moduleLessonGeneration());
  } catch {
    return false;
  }
}
