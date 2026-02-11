import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { appEnv, regenerationQueueEnv } from '@/lib/config/env';
import { drainRegenerationQueue } from '@/lib/jobs/regeneration-worker';
import { logger } from '@/lib/logging/logger';

function readWorkerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  return request.headers.get('x-regeneration-worker-token');
}

function tokensMatch(expectedToken: string, providedToken: string): boolean {
  const expected = Buffer.from(expectedToken);
  const provided = Buffer.from(providedToken);

  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}

export async function POST(request: Request): Promise<Response> {
  if (!regenerationQueueEnv.enabled) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Regeneration queue is disabled. Enable REGENERATION_QUEUE_ENABLED to process jobs.',
      },
      { status: 503 }
    );
  }

  const expectedToken = regenerationQueueEnv.workerToken;
  if (expectedToken) {
    const providedToken = readWorkerToken(request);
    if (!providedToken || !tokensMatch(expectedToken, providedToken)) {
      logger.warn(
        {
          path: new URL(request.url).pathname,
          method: request.method,
          hasToken: Boolean(providedToken),
        },
        'Unauthorized regeneration worker trigger attempt'
      );

      return NextResponse.json(
        { ok: false, error: 'Unauthorized worker trigger.' },
        { status: 401 }
      );
    }
  } else if (appEnv.isProduction) {
    logger.error(
      { path: new URL(request.url).pathname, method: request.method },
      'Regeneration worker token missing in production'
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          'Worker token is not configured. Set REGENERATION_WORKER_TOKEN in production.',
      },
      { status: 503 }
    );
  }

  const maxJobs = regenerationQueueEnv.maxJobsPerDrain;

  try {
    logger.info({ maxJobs }, 'Starting regeneration queue drain');

    const drained = await drainRegenerationQueue({ maxJobs });

    logger.info({ maxJobs, drained }, 'Completed regeneration queue drain');

    return NextResponse.json({ ok: true, ...drained });
  } catch (error) {
    logger.error(
      { error, maxJobs },
      'Failed to drain regeneration queue from internal route'
    );

    const message = error instanceof Error ? error.message : 'drain failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
