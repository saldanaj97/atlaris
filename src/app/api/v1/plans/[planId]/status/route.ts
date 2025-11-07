import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { getDb } from '@/lib/db/runtime';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { learningPlans, modules } from '@/lib/db/schema';
import { getJobsByPlanId } from '@/lib/jobs/queue';
import { eq } from 'drizzle-orm';

/**
 * GET /api/v1/plans/:planId/status
 * Returns the status of a learning plan's generation process
 */

function getPlanId(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // segments: ['api', 'v1', 'plans', '{planId}', 'status']
  return segments[segments.length - 2];
}

type PlanStatus = 'pending' | 'processing' | 'ready' | 'failed';

export const GET = withErrorBoundary(
  withAuth(async ({ req, userId }) => {
    const planId = getPlanId(req);
    if (!planId) {
      throw new ValidationError('Plan id is required in the request path.');
    }

    const user = await getUserByClerkId(userId);
    if (!user) {
      throw new NotFoundError('User not found.');
    }

    // Fetch the plan (RLS-enforced via getDb)
    const db = getDb();
    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, planId),
    });

    if (!plan) {
      throw new NotFoundError('Learning plan not found.');
    }

    // Verify ownership
    if (plan.userId !== user.id) {
      throw new NotFoundError('Learning plan not found.');
    }

    // Fetch jobs for this plan
    const jobs = await getJobsByPlanId(planId);

    // Check if plan has modules
    const planModules = await db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.planId, planId))
      .limit(1);

    const hasModules = planModules.length > 0;

    // Determine status based on jobs and modules
    let status: PlanStatus = 'pending';
    const latestJob = jobs[0] ?? null;
    const attempts = jobs.length;

    if (jobs.some((job) => job.status === 'processing')) {
      status = 'processing';
    } else if (hasModules && latestJob?.status === 'completed') {
      status = 'ready';
    } else if (latestJob?.status === 'failed') {
      status = 'failed';
    } else if (latestJob?.status === 'completed' && !hasModules) {
      // Job completed but no modules - something went wrong
      status = 'failed';
    }

    return json({
      planId: plan.id,
      status,
      attempts,
      latestJobId: latestJob?.id ?? null,
      latestJobStatus: latestJob?.status ?? null,
      latestJobError: latestJob?.error ?? null,
      createdAt: plan.createdAt?.toISOString(),
      updatedAt: plan.updatedAt?.toISOString(),
    });
  })
);
