import { moduleLessonGeneration } from '@/flags';

let testOverride: boolean | undefined;

/** Test hook: force enablement without evaluating the Vercel Flag. */
export function setModuleLessonGenerationEnabledForTests(
  value: boolean | undefined,
): void {
  testOverride = value;
}

/** Fail closed when the Vercel Flag cannot be evaluated. */
export async function resolveModuleLessonGenerationEnabled(): Promise<boolean> {
  if (testOverride !== undefined) {
    return testOverride;
  }

  try {
    return Boolean(await moduleLessonGeneration());
  } catch {
    return false;
  }
}
