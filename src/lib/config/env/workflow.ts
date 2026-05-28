import {
  createServerEnvAccess,
  EnvValidationError,
  getProcessEnvSource,
  type ServerEnvAccess,
} from '@/lib/config/env/shared';

interface WorkflowEnv {
  /** `MODULE_LESSON_WORKFLOW_ENABLED`; defaults to false. */
  readonly moduleLessonWorkflowEnabled: boolean;
  /** `PLAN_REGENERATION_WORKFLOW_ENABLED`; defaults to false. */
  readonly planRegenerationWorkflowEnabled: boolean;
  /** `PLAN_GENERATION_WORKFLOW_ENABLED`; defaults to false. */
  readonly planGenerationWorkflowEnabled: boolean;
  /**
   * Shared bearer token for non-Vercel workflow callback routes.
   * Undefined outside production; Vercel-hosted deploys rely on queue consumer security.
   */
  readonly callbackToken: string | undefined;
}

function parseWorkflowFlag(
  raw: string | undefined,
  envKey: string,
  defaultValue: boolean,
): boolean {
  if (raw === undefined) {
    return defaultValue;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === '') {
    return defaultValue;
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

function readWorkflowEnv(access: ServerEnvAccess): WorkflowEnv {
  return {
    get moduleLessonWorkflowEnabled(): boolean {
      return parseWorkflowFlag(
        access.getServerOptional('MODULE_LESSON_WORKFLOW_ENABLED'),
        'MODULE_LESSON_WORKFLOW_ENABLED',
        false,
      );
    },
    get planRegenerationWorkflowEnabled(): boolean {
      return parseWorkflowFlag(
        access.getServerOptional('PLAN_REGENERATION_WORKFLOW_ENABLED'),
        'PLAN_REGENERATION_WORKFLOW_ENABLED',
        false,
      );
    },
    get planGenerationWorkflowEnabled(): boolean {
      return parseWorkflowFlag(
        access.getServerOptional('PLAN_GENERATION_WORKFLOW_ENABLED'),
        'PLAN_GENERATION_WORKFLOW_ENABLED',
        false,
      );
    },
    get callbackToken(): string | undefined {
      return access.getServerRequiredProdOnly('WORKFLOW_CALLBACK_TOKEN');
    },
  };
}

const defaultWorkflowAccess = createServerEnvAccess(getProcessEnvSource);

export const workflowEnv: WorkflowEnv = readWorkflowEnv(defaultWorkflowAccess);

/** Test hook: same semantics as `workflowEnv` with an explicit access layer. */
export function createWorkflowEnvForTests(
  access: ReturnType<typeof createServerEnvAccess>,
): WorkflowEnv {
  return readWorkflowEnv(access);
}
