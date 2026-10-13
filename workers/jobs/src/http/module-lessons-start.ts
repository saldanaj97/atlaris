import type { JobSwitchVars } from '../env';
import type { ModuleLessonsWorkflowParams } from '../workflows/module-lessons/run';
import type { SigningSecrets } from './signature';
import type { Logger } from '@/lib/logging/logger';

import { isJobEnabled, isJobsPaused } from '../switches';
import { findInstance } from '../workflow-instance';
import { moduleLessonsInstanceId } from '../workflows/module-lessons/instance-id';
import { MODULE_LESSONS_JOB } from '../workflows/module-lessons/run';
import { unauthorizedResponse, verifySignedRequest } from './signature';
import {
  type ModuleLessonsStartCommand,
  moduleLessonsStartCommandSchema,
} from '@/lib/jobs-worker/contract';

export type ModuleLessonsStartDeps = {
  readonly env: SigningSecrets & JobSwitchVars;
  readonly workflow: Pick<
    Workflow<ModuleLessonsWorkflowParams>,
    'create' | 'get'
  >;
  readonly logger: Pick<Logger, 'info' | 'error'>;
  readonly nowMs?: number;
};

function parseBody(body: string): ModuleLessonsStartCommand | null {
  try {
    const parsed = moduleLessonsStartCommandSchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * `POST /v1/module-lessons/start`: verifies the signature, then creates the
 * module lessons Workflow instance. The app has already made the provisional
 * claim; the Workflow's first step adopts it. The instance ID makes repeated
 * commands for one claim harmless while its instance is live; an instance that
 * already ended counts as a failed start.
 */
export async function handleModuleLessonsStart(
  request: Request,
  deps: ModuleLessonsStartDeps,
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
  if (!isJobEnabled(deps.env, 'MODULE_LESSONS')) {
    return Response.json({ code: 'job_disabled' }, { status: 503 });
  }

  const instanceId = await moduleLessonsInstanceId(
    command.moduleId,
    command.batchRequestId,
  );
  const fields = {
    job: MODULE_LESSONS_JOB,
    instanceId,
    planId: command.planId,
    moduleId: command.moduleId,
    correlationId: command.correlationId,
  };

  try {
    await deps.workflow.create({ id: instanceId, params: command });
  } catch (error) {
    const existing = await findInstance(deps.workflow, instanceId);
    if (existing && !existing.terminal) {
      deps.logger.info(fields, 'Module lessons workflow already exists');
      return Response.json({ accepted: true, duplicate: true });
    }
    // An instance that already ended will not adopt the claim: report a failed
    // start so the app reverts it.
    deps.logger.error(
      { ...fields, err: error },
      existing
        ? 'Module lessons workflow instance already ended'
        : 'Module lessons workflow could not be started',
    );
    return Response.json({ code: 'workflow_start_failed' }, { status: 503 });
  }

  deps.logger.info(fields, 'Module lessons workflow started');
  return Response.json({ accepted: true, instanceId }, { status: 202 });
}
