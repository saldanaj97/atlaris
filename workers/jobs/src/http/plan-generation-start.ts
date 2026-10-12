import type { JobSwitchVars } from '../env';
import type { PlanGenerationWorkflowParams } from '../workflows/plan-generation/run';
import type { SigningSecrets } from './signature';
import type { Logger } from '@/lib/logging/logger';

import { isJobEnabled, isJobsPaused } from '../switches';
import { PLAN_GENERATION_JOB } from '../workflows/plan-generation/run';
import { unauthorizedResponse, verifySignedRequest } from './signature';
import {
  type PlanGenerationStartCommand,
  planGenerationStartCommandSchema,
} from '@/lib/jobs-worker/contract';

export type PlanGenerationStartDeps = {
  readonly env: SigningSecrets & JobSwitchVars;
  readonly workflow: Pick<
    Workflow<PlanGenerationWorkflowParams>,
    'create' | 'get'
  >;
  readonly logger: Pick<Logger, 'info' | 'error'>;
  readonly nowMs?: number;
};

/** One instance per reserved attempt (design note, Decision 4). */
export function planGenerationInstanceId(attemptId: string): string {
  return `plan-${attemptId}`;
}

function parseBody(body: string): PlanGenerationStartCommand | null {
  try {
    const parsed = planGenerationStartCommandSchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function instanceExists(
  workflow: PlanGenerationStartDeps['workflow'],
  instanceId: string,
): Promise<boolean> {
  try {
    await workflow.get(instanceId);
    return true;
  } catch {
    return false;
  }
}

/**
 * `POST /v1/plan-generation/start`: verifies the signature, then creates the
 * plan-generation Workflow instance for the attempt the app already reserved.
 * The instance ID makes repeated commands for one attempt harmless.
 */
export async function handlePlanGenerationStart(
  request: Request,
  deps: PlanGenerationStartDeps,
): Promise<Response> {
  const verification = await verifySignedRequest(request, deps.env, deps.nowMs);
  if (!verification.ok) {
    return unauthorizedResponse();
  }

  const command = parseBody(verification.body);
  if (!command) {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (isJobsPaused(deps.env)) {
    return Response.json({ code: 'jobs_paused' }, { status: 503 });
  }
  if (!isJobEnabled(deps.env, 'PLAN_GENERATION')) {
    return Response.json({ code: 'job_disabled' }, { status: 503 });
  }

  const instanceId = planGenerationInstanceId(command.reservation.attemptId);
  const fields = {
    job: PLAN_GENERATION_JOB,
    instanceId,
    planId: command.planId,
    attemptId: command.reservation.attemptId,
    correlationId: command.correlationId,
  };

  try {
    await deps.workflow.create({ id: instanceId, params: command });
  } catch (error) {
    if (await instanceExists(deps.workflow, instanceId)) {
      deps.logger.info(fields, 'Plan generation workflow already exists');
      return Response.json({ accepted: true, duplicate: true });
    }
    deps.logger.error(
      { ...fields, err: error },
      'Plan generation workflow could not be started',
    );
    return Response.json({ code: 'workflow_start_failed' }, { status: 503 });
  }

  deps.logger.info(fields, 'Plan generation workflow started');
  return Response.json({ accepted: true, instanceId }, { status: 202 });
}
