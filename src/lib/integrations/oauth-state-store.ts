import { createHash, randomBytes } from 'crypto';
import { and, eq, gt, sql } from 'drizzle-orm';

import { oauthStateTokens } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

import type { OAuthStateStore } from './oauth-state.types';

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function createOAuthStateStore(): OAuthStateStore {
  return {
    async issue({ clerkUserId, provider }): Promise<string> {
      const plainToken = generateToken();
      const tokenHash = hashToken(plainToken);
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

      await db.insert(oauthStateTokens).values({
        stateTokenHash: tokenHash,
        clerkUserId,
        provider: provider ?? null,
        expiresAt,
      });

      return plainToken;
    },

    async consume({ stateToken }): Promise<string | null> {
      const tokenHash = hashToken(stateToken);
      const now = new Date();

      // Atomic delete-and-return: ensures single-use even under concurrent requests
      const [deleted] = await db
        .delete(oauthStateTokens)
        .where(
          and(
            eq(oauthStateTokens.stateTokenHash, tokenHash),
            gt(oauthStateTokens.expiresAt, now)
          )
        )
        .returning({ clerkUserId: oauthStateTokens.clerkUserId });

      return deleted?.clerkUserId ?? null;
    },
  };
}

export async function cleanupExpiredTokens(): Promise<number> {
  const result = await db
    .delete(oauthStateTokens)
    .where(gt(sql`now()`, oauthStateTokens.expiresAt));

  return result.count;
}
