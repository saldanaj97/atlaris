import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { getDb } from '@/lib/db/runtime';
import { users, learningPlans } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getOAuthTokens } from '@/lib/integrations/oauth';
import { exportPlanToNotion } from '@/lib/integrations/notion/sync';
import { z } from 'zod';
import { checkExportQuota, incrementExportUsage } from '@/lib/db/usage';

const exportRequestSchema = z.object({ planId: z.string().uuid() });

export const POST = withErrorBoundary(
  withAuth(async ({ req, userId: clerkUserId }) => {
    const request = req as NextRequest;
    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get Notion token
    const notionTokens = await getOAuthTokens(user.id, 'notion');
    if (!notionTokens) {
      return NextResponse.json(
        { error: 'Notion not connected' },
        { status: 401 }
      );
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = exportRequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid planId' }, { status: 400 });
    }

    // Ensure the plan exists and is owned by the authenticated user before exporting
    try {
      const [plan] = await db
        .select({ userId: learningPlans.userId })
        .from(learningPlans)
        .where(eq(learningPlans.id, parsed.data.planId))
        .limit(1);

      if (!plan) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

      if (plan.userId !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch (e) {
      console.error('Failed to load plan for Notion export:', e);
      return NextResponse.json(
        { error: 'Failed to load plan' },
        { status: 500 }
      );
    }

    try {
      // Tier gate: check export quota for current subscription tier
      const canExport = await checkExportQuota(user.id, user.subscriptionTier);
      if (!canExport) {
        return NextResponse.json(
          {
            error: 'Export quota exceeded',
            message: 'Upgrade your plan to export more learning plans',
          },
          { status: 403 }
        );
      }

      const notionPageId = await exportPlanToNotion(
        parsed.data.planId,
        user.id,
        notionTokens.accessToken
      );

      // Increment usage after a successful export (non-blocking)
      try {
        await incrementExportUsage(user.id);
      } catch (e) {
        console.error('Failed to increment export usage for Notion export', {
          userId: user.id,
          error: e,
        });
        // Do not fail the request if usage tracking fails
      }
      return NextResponse.json({ notionPageId, success: true });
    } catch (error: unknown) {
      console.error('Notion export failed:', error);
      let errorMessage = 'Unknown error occurred during export';
      let status = 500;
      if (error instanceof Error) {
        const msg = error.message;
        if (msg.includes('Plan not found')) {
          errorMessage = 'Plan not found';
          status = 404;
        } else if (msg.includes('Access denied')) {
          errorMessage = 'Forbidden';
          status = 403;
        } else {
          errorMessage = msg;
        }
      }
      return NextResponse.json({ error: errorMessage }, { status });
    }
  })
);
