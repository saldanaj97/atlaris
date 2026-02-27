import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import {
  deleteOAuthTokens,
  getOAuthTokens,
  revokeGoogleTokens,
} from '@/lib/integrations/oauth';
import { z } from 'zod';

const disconnectSchema = z
  .object({
    provider: z.literal('google_calendar'),
  })
  .strict();

// POST /api/v1/integrations/disconnect
export const POST = withErrorBoundary(
  withAuthAndRateLimit('integration', async ({ req, user }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError('Invalid JSON in request body');
    }

    const parsed = disconnectSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid disconnect payload',
        parsed.error.flatten()
      );
    }

    const { provider } = parsed.data;
    const oauthTokens = await getOAuthTokens(user.id, provider);

    if (!oauthTokens) {
      throw new NotFoundError(`No integration found for provider: ${provider}`);
    }

    const tokensToRevoke = [oauthTokens.accessToken];
    if (oauthTokens.refreshToken) {
      tokensToRevoke.push(oauthTokens.refreshToken);
    }

    try {
      await Promise.all(
        tokensToRevoke.map((token) => revokeGoogleTokens(token))
      );
    } finally {
      await deleteOAuthTokens(user.id, provider);
    }

    return json({
      provider,
      disconnected: true,
    });
  })
);
