import {
  createServerEnvAccess,
  EnvValidationError,
  getProcessEnvSource,
  type ServerEnvAccess,
} from '@/lib/config/env/shared';
import { z } from 'zod';

const WORKFLOW_CALLBACK_TOKEN_ENV_KEY = 'WORKFLOW_CALLBACK_TOKEN';

const workflowCallbackTokenSchema = z
  .string()
  .trim()
  .min(1, {
    message: `${WORKFLOW_CALLBACK_TOKEN_ENV_KEY} must not be empty or whitespace-only`,
  });

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
function parseWorkflowCallbackToken(
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
