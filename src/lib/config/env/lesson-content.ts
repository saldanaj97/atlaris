import {
  createServerEnvAccess,
  EnvValidationError,
  getProcessEnvSource,
  parseNodeEnv,
  type ServerEnvAccess,
} from '@/lib/config/env/shared';

interface LessonContentEnv {
  /** `LESSON_GENERATION_ENABLED`; development defaults to true, otherwise false; strict `true|false|1|0`. */
  readonly generationEnabled: boolean;
}

function isDevelopmentRuntime(): boolean {
  return parseNodeEnv(getProcessEnvSource()) === 'development';
}

function parseLessonGenerationEnabled(
  raw: string | undefined,
  envKey: string,
  isDevelopment: boolean,
): boolean {
  if (raw === undefined) {
    return isDevelopment;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === '') {
    return isDevelopment;
  }
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  throw new EnvValidationError(
    `${envKey} must be one of: true, false, 1, 0`,
    envKey,
  );
}

const defaultLessonContentAccess = createServerEnvAccess(getProcessEnvSource);

function readGenerationEnabled(access: ServerEnvAccess): boolean {
  return parseLessonGenerationEnabled(
    access.getServerOptional('LESSON_GENERATION_ENABLED'),
    'LESSON_GENERATION_ENABLED',
    isDevelopmentRuntime(),
  );
}

/**
 * Lesson-content feature flags (server env).
 */
export const lessonContentEnv: LessonContentEnv = {
  get generationEnabled(): boolean {
    return readGenerationEnabled(defaultLessonContentAccess);
  },
};

/** Test hook: same semantics as `lessonContentEnv` with an explicit access layer. */
export function createLessonContentEnvForTests(
  access: ServerEnvAccess,
): LessonContentEnv {
  return {
    get generationEnabled(): boolean {
      return readGenerationEnabled(access);
    },
  };
}
