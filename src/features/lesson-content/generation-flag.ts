import { moduleLessonGeneration } from '@/flags';

let testOverride: boolean | undefined;

export function setModuleLessonGenerationEnabledForTests(
  value: boolean | undefined,
): void {
  testOverride = value;
}

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
