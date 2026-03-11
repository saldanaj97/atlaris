import { createHash, randomBytes } from 'crypto';
import { and, eq, gt, lt } from 'drizzle-orm';

import { getDb } from '@/lib/db/runtime';
import { oauthStateTokens } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface OAuthStateStore {
  issue(params: { authUserId: string; provider: string }): Promise<string>;
  consume(params: {
    stateToken: string;
    provider: string;
  }): Promise<string | null>;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

function createOAuthStateStore(): OAuthStateStore {
  return {
    async issue({ authUserId, provider }): Promise<string> {
      const db = getDb();
      const plainToken = generateToken();
      const tokenHash = hashToken(plainToken);
      const now = new Date();
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

      // Opportunistic cleanup: remove expired tokens to prevent unbounded growth.
      // Fire-and-forget — failures must not block token issuance.
      db.delete(oauthStateTokens)
        .where(lt(oauthStateTokens.expiresAt, now))
        .then(
          () => {},
          (err: unknown) => {
            logger.warn({ err }, 'Failed to purge expired OAuth state tokens');
          }
        );

      await db.insert(oauthStateTokens).values({
        stateTokenHash: tokenHash,
        authUserId,
        provider,
        expiresAt,
      });

      return plainToken;
    },

    async consume({ stateToken, provider }): Promise<string | null> {
      const db = getDb();
      const tokenHash = hashToken(stateToken);
      const now = new Date();

      // Atomic delete-and-return: ensures single-use even under concurrent requests
      const [deleted] = await db
        .delete(oauthStateTokens)
        .where(
          and(
            eq(oauthStateTokens.stateTokenHash, tokenHash),
            eq(oauthStateTokens.provider, provider),
            gt(oauthStateTokens.expiresAt, now)
          )
        )
        .returning({ authUserId: oauthStateTokens.authUserId });

      return deleted?.authUserId ?? null;
    },
  };
}

let defaultStore: OAuthStateStore | null = null;

function getDefaultStore(): OAuthStateStore {
  if (!defaultStore) {
    defaultStore = createOAuthStateStore();
  }
  return defaultStore;
}

export async function generateAndStoreOAuthStateToken(
  authUserId: string,
  provider: string,
  store: OAuthStateStore = getDefaultStore()
): Promise<string> {
  return store.issue({ authUserId, provider });
}

export async function validateOAuthStateToken(
  stateToken: string,
  provider: string,
  store: OAuthStateStore = getDefaultStore()
): Promise<string | null> {
  return store.consume({ stateToken, provider });
}
