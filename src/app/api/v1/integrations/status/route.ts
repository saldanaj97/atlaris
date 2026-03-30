import { eq } from 'drizzle-orm';
import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { json } from '@/lib/api/response';
import type { IntegrationProvider } from '@/lib/db/enums';
import { getDb } from '@/lib/db/runtime';
import { integrationTokens } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';

export type IntegrationStatusResponse = {
  integrations: {
    provider: IntegrationProvider;
    connected: boolean;
    connectedAt: string | null;
  }[];
};

// GET /api/v1/integrations/status
export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ user }): Promise<Response> => {
    logger.info({ userId: user.id }, 'Integrations status fetch started');

    try {
      const db = getDb();

      const tokens = await db
        .select({
          provider: integrationTokens.provider,
          createdAt: integrationTokens.createdAt,
        })
        .from(integrationTokens)
        .where(eq(integrationTokens.userId, user.id));

      logger.info(
        { userId: user.id, tokenCount: tokens.length },
        'Integrations status token count fetched'
      );

      const integrations: IntegrationStatusResponse['integrations'] =
        tokens.map((token) => ({
          provider: token.provider,
          connected: true,
          connectedAt: token.createdAt?.toISOString() ?? null,
        }));

      logger.info(
        { userId: user.id, integrationCount: integrations.length },
        'Integrations status fetch succeeded'
      );

      return json<IntegrationStatusResponse>({ integrations });
    } catch (error: unknown) {
      logger.error(
        { userId: user.id, error },
        'Integrations status fetch failed'
      );
      throw error;
    }
  })
);
