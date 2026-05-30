import {
  createServerEnvAccess,
  EnvValidationError,
  getProcessEnvSource,
  type ServerEnvAccess,
} from '@/lib/config/env/shared';
import { z } from 'zod';

export const WORKFLOW_CALLBACK_TOKEN_ENV_KEY = 'WORKFLOW_CALLBACK_TOKEN';

const workflowCallbackTokenSchema = z
  .string()
  .trim()
  .min(1, {
    message: `${WORKFLOW_CALLBACK_TOKEN_ENV_KEY} must not be empty or whitespace-only`,
  });

interface WorkflowEnv {
  /** `MODULE_LESSON_WORKFLOW_ENABLED`; defaults to false. */
  readonly moduleLessonWorkflowEnabled: boolean;
  /** `PLAN_REGENERATION_WORKFLOW_ENABLED`; defaults to false. */
  readonly planRegenerationWorkflowEnabled: boolean;
  /** `PLAN_GENERATION_WORKFLOW_ENABLED`; defaults to false. */
  readonly planGenerationWorkflowEnabled: boolean;
  /**
   * Shared bearer token for non-Vercel workflow callback routes.
   * Undefined when not configured; callback auth enforces production requirements.
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

export type WorkflowCallbackTokenConfigRead =
  | { readonly status: 'valid'; readonly token: string | undefined }
  | { readonly status: 'invalid' };

/** Reads callback token config without throwing on whitespace-only values. */
export function readWorkflowCallbackTokenConfig(
  access?: ServerEnvAccess,
): WorkflowCallbackTokenConfigRead {
  const envAccess = access ?? createServerEnvAccess(getProcessEnvSource);
  try {
    return {
      status: 'valid',
      token: parseWorkflowCallbackToken(
        envAccess.getServerEnvRaw(WORKFLOW_CALLBACK_TOKEN_ENV_KEY),
      ),
    };
  } catch (error) {
    if (error instanceof EnvValidationError) {
      return { status: 'invalid' };
    }
    throw error;
  }
}

/** Parses optional workflow callback token; unset/blank env is undefined. */
export function parseWorkflowCallbackToken(
  raw: string | undefined,
): string | undefined {
  if (raw === undefined || raw === '') {
    return undefined;
  }

  const parsed = workflowCallbackTokenSchema.safeParse(raw);
  if (!parsed.success) {
    throw new EnvValidationError(
      parsed.error.issues[0]?.message ??
        `Invalid ${WORKFLOW_CALLBACK_TOKEN_ENV_KEY}`,
      WORKFLOW_CALLBACK_TOKEN_ENV_KEY,
    );
  }

  return parsed.data;
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
      return parseWorkflowCallbackToken(
        access.getServerEnvRaw(WORKFLOW_CALLBACK_TOKEN_ENV_KEY),
      );
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
