import { eq } from 'drizzle-orm';
import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { json } from '@/lib/api/response';
import { getDb } from '@/lib/db/runtime';
import { integrationTokens } from '@/lib/db/schema';

export type IntegrationStatusResponse = {
  integrations: {
    provider: string;
    connected: boolean;
    connectedAt: string | null;
  }[];
};

// GET /api/v1/integrations/status
export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ user }) => {
    const db = getDb();

    const tokens = await db
      .select({
        provider: integrationTokens.provider,
        createdAt: integrationTokens.createdAt,
      })
      .from(integrationTokens)
      .where(eq(integrationTokens.userId, user.id));

    const integrations = tokens.map((t) => ({
      provider: t.provider,
      connected: true,
      connectedAt: t.createdAt?.toISOString() ?? null,
    }));

    return json<IntegrationStatusResponse>({ integrations });
  })
);
