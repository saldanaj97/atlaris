import { oauthEncryptionEnv } from '@/lib/config/env';
import { getDb } from '@/lib/db/runtime';
import { integrationTokens } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import { and, eq } from 'drizzle-orm';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const GOOGLE_OAUTH_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_OAUTH_REVOKE_TIMEOUT_MS = 10_000;

type FetchLike = typeof fetch;

export interface OAuthTokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope: string;
}

function getEncryptionKey(): Buffer {
  const key = oauthEncryptionEnv.encryptionKey;
  // AES-256 requires a 32-byte (256-bit) key, which is 64 hex characters
  if (key.length !== 64) {
    throw new Error(
      `OAUTH_ENCRYPTION_KEY must be 64 hex characters (32 bytes) for AES-256, got ${key.length} characters`
    );
  }
  return Buffer.from(key, 'hex');
}

export function encryptToken(tokenData: OAuthTokenData): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const payload = JSON.stringify({
    accessToken: tokenData.accessToken,
    refreshToken: tokenData.refreshToken,
    expiresAt: tokenData.expiresAt?.toISOString(),
    scope: tokenData.scope,
  });

  let encrypted = cipher.update(payload, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // Return: IV + auth tag + encrypted data (hex encoded)
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

export function decryptToken(encryptedData: string): OAuthTokenData {
  const key = getEncryptionKey();
  const parts = encryptedData.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  const parsed = JSON.parse(decrypted) as OAuthTokenData;

  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
    scope: parsed.scope,
  };
}

export type IntegrationProvider = 'google_calendar';

export async function revokeGoogleTokens(
  accessToken: string,
  fetchImpl: FetchLike = fetch
): Promise<void> {
  const body = new URLSearchParams({ token: accessToken });
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, GOOGLE_OAUTH_REVOKE_TIMEOUT_MS);

  try {
    const response = await fetchImpl(GOOGLE_OAUTH_REVOKE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn(
        {
          status: response.status,
          provider: 'google_calendar',
        },
        'Google OAuth token revocation failed; continuing disconnect cleanup'
      );
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn(
        {
          provider: 'google_calendar',
          timeoutMs: GOOGLE_OAUTH_REVOKE_TIMEOUT_MS,
        },
        'Google OAuth token revocation timed out; continuing disconnect cleanup'
      );
      return;
    }

    logger.warn(
      {
        error,
        provider: 'google_calendar',
      },
      'Google OAuth token revocation threw; continuing disconnect cleanup'
    );
  } finally {
    clearTimeout(timeout);
  }
}

interface StoreTokensParams {
  userId: string;
  provider: IntegrationProvider;
  tokenData: OAuthTokenData;
  workspaceId?: string;
  workspaceName?: string;
  botId?: string;
}

export async function storeOAuthTokens(
  params: StoreTokensParams
): Promise<void> {
  const { userId, provider, tokenData, workspaceId, workspaceName, botId } =
    params;

  const encryptedAccess = encryptToken({
    ...tokenData,
    refreshToken: undefined,
  });
  const encryptedRefresh = tokenData.refreshToken
    ? encryptToken({
        accessToken: tokenData.refreshToken,
        scope: tokenData.scope,
      })
    : null;

  const db = getDb();
  await db
    .insert(integrationTokens)
    .values({
      userId,
      provider,
      encryptedAccessToken: encryptedAccess,
      encryptedRefreshToken: encryptedRefresh,
      scope: tokenData.scope,
      expiresAt: tokenData.expiresAt ?? null,
      workspaceId: workspaceId ?? null,
      workspaceName: workspaceName ?? null,
      botId: botId ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [integrationTokens.userId, integrationTokens.provider],
      set: {
        encryptedAccessToken: encryptedAccess,
        encryptedRefreshToken: encryptedRefresh,
        scope: tokenData.scope,
        expiresAt: tokenData.expiresAt ?? null,
        workspaceId: workspaceId ?? null,
        workspaceName: workspaceName ?? null,
        botId: botId ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function getOAuthTokens(
  userId: string,
  provider: IntegrationProvider
): Promise<OAuthTokenData | null> {
  const db = getDb();
  const [record] = await db
    .select()
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, provider)
      )
    )
    .limit(1);

  if (!record) {
    return null;
  }

  const accessTokenData = decryptToken(record.encryptedAccessToken);
  const refreshToken = record.encryptedRefreshToken
    ? decryptToken(record.encryptedRefreshToken).accessToken
    : undefined;

  return {
    accessToken: accessTokenData.accessToken,
    refreshToken,
    expiresAt: record.expiresAt ?? undefined,
    scope: record.scope,
  };
}

export async function deleteOAuthTokens(
  userId: string,
  provider: IntegrationProvider
): Promise<void> {
  const db = getDb();
  await db
    .delete(integrationTokens)
    .where(
      and(
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, provider)
      )
    );
}
