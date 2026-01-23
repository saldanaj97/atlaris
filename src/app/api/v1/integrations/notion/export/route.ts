import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { AppError } from '@/lib/api/errors';
import { getDb } from '@/lib/db/runtime';
import { users, learningPlans } from '@/lib/db/schema';
import { getOAuthTokens } from '@/lib/integrations/oauth';
import { exportPlanToNotion } from '@/lib/integrations/notion/sync';
import { createNotionIntegrationClient } from '@/lib/integrations/notion/factory';
import { checkExportQuota, incrementExportUsage } from '@/lib/db/usage';
import {
  attachRequestIdHeader,
  createRequestContext,
} from '@/lib/logging/request-context';
import { eq } from 'drizzle-orm';

const exportRequestSchema = z.object({ planId: z.string().uuid() });

export const POST = withErrorBoundary(
  withAuthAndRateLimit('integration', async ({ req, userId: clerkUserId }) => {
    const request = req as NextRequest;
    const { requestId, logger } = createRequestContext(req, {
      route: 'notion_export',
      clerkUserId,
    });
    const respondJson = (payload: unknown, init?: ResponseInit) =>
      attachRequestIdHeader(NextResponse.json(payload, init), requestId);

    const respondAppError = (error: AppError) => {
      const body: Record<string, unknown> = {
        error: error.message,
        code: error.code(),
      };

      const classification = error.classification();
      if (classification) {
        body.classification = classification;
      }

      const details = error.details();
      if (details !== undefined) {
        body.details = details;
      }

      return respondJson(body, { status: error.status() });
    };

    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId))
      .limit(1);

    if (!user) {
      return respondJson({ error: 'User not found' }, { status: 404 });
    }

    // Get Notion token
    const notionTokens = await getOAuthTokens(user.id, 'notion');

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return respondJson({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = exportRequestSchema.safeParse(json);
    if (!parsed.success) {
      return respondJson({ error: 'Invalid planId' }, { status: 400 });
    }
    const { planId } = parsed.data;

    // Ensure the plan exists and is owned by the authenticated user before exporting
    try {
      const [plan] = await db
        .select({ userId: learningPlans.userId })
        .from(learningPlans)
        .where(eq(learningPlans.id, planId))
        .limit(1);

      if (!plan) {
        return respondJson({ error: 'Plan not found' }, { status: 404 });
      }

      if (plan.userId !== user.id) {
        return respondJson({ error: 'Forbidden' }, { status: 403 });
      }
    } catch (e) {
      logger.error(
        {
          userId: user.id,
          planId,
          error: e,
        },
        'Failed to load plan for Notion export'
      );
      return respondJson({ error: 'Failed to load plan' }, { status: 500 });
    }

    if (!notionTokens) {
      return respondJson(
        { error: 'Notion integration not found' },
        { status: 404 }
      );
    }

    try {
      // Tier gate: check export quota for current subscription tier
      const canExport = await checkExportQuota(user.id, user.subscriptionTier);
      if (!canExport) {
        return respondJson(
          {
            error: 'Export quota exceeded',
            message: 'Upgrade your plan to export more learning plans',
          },
          { status: 403 }
        );
      }

      const notionClient = createNotionIntegrationClient(
        notionTokens.accessToken
      );

      const notionPageId = await exportPlanToNotion(
        planId,
        user.id,
        notionClient
      );

      // Increment usage after a successful export (non-blocking)
      try {
        await incrementExportUsage(user.id);
      } catch (e) {
        logger.error(
          {
            userId: user.id,
            error: e,
          },
          'Failed to increment export usage for Notion export'
        );
        // Do not fail the request if usage tracking fails
      }
      return respondJson({ notionPageId, success: true });
    } catch (error: unknown) {
      logger.error(
        {
          userId: user.id,
          planId,
          error,
        },
        'Notion export failed'
      );

      if (error instanceof AppError) {
        return respondAppError(error);
      }

      return respondJson(
        { error: 'Notion export failed', code: 'NOTION_EXPORT_FAILED' },
        { status: 500 }
      );
    }
  })
);
