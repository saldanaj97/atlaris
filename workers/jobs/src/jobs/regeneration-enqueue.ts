import type { JobSwitchVars } from '../env';
import type { SigningSecrets } from '../http/signature';
import type {
  CaptureException,
  RegenerationQueue,
  RegenerationQueueMessage,
} from './regeneration-shared';
import type { Logger } from '@/lib/logging/logger';

import { unauthorizedResponse, verifySignedRequest } from '../http/signature';
import {
  readRegenerationSwitch,
  REGENERATION_JOB_TAG,
  REGENERATION_SENTRY_TAGS,
} from './regeneration-shared';
import { regenerationEnqueueCommandSchema } from '@/lib/jobs-worker/contract';

export type RegenerationEnqueueDeps = {
  readonly env: SigningSecrets & JobSwitchVars;
  readonly queue: Pick<RegenerationQueue, 'send'>;
  readonly logger: Pick<Logger, 'info' | 'warn'>;
  readonly captureException: CaptureException;
  readonly nowMs?: number;
};

function parseBody(body: string): RegenerationQueueMessage | null {
  try {
    const parsed = regenerationEnqueueCommandSchema.safeParse(JSON.parse(body));
    return parsed.success ? { v: 1, jobId: parsed.data.jobId } : null;
  } catch {
    return null;
  }
}

/**
 * `POST /v1/regeneration/enqueue { v: 1, jobId }`: verifies the signature,
 * then puts `{ v: 1, jobId }` on the regeneration queue. The consumer's CAS
 * claim on the `job_queue` row makes duplicate sends harmless.
 */
export async function handleRegenerationEnqueue(
  request: Request,
  deps: RegenerationEnqueueDeps,
): Promise<Response> {
  const verification = await verifySignedRequest(request, deps.env, deps.nowMs);
  if (!verification.ok) {
    return unauthorizedResponse();
  }

  const switchState = readRegenerationSwitch(deps.env);
  if (switchState !== 'enabled') {
    deps.logger.info(
      { job: REGENERATION_JOB_TAG, switchState },
      'Regeneration enqueue refused while the job is off',
    );
    return Response.json(
      { code: switchState === 'paused' ? 'jobs_paused' : 'job_disabled' },
      { status: 503 },
    );
  }

  const message = parseBody(verification.body);
  if (!message) {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    await deps.queue.send(message);
  } catch (error) {
    deps.captureException(error, {
      tags: REGENERATION_SENTRY_TAGS,
      extra: { jobId: message.jobId },
    });
    return Response.json({ error: 'enqueue_failed' }, { status: 500 });
  }

  deps.logger.info(
    { job: REGENERATION_JOB_TAG, jobId: message.jobId },
    'Regeneration job queued',
  );
  return Response.json(
    { accepted: true, jobId: message.jobId },
    { status: 202 },
  );
}
