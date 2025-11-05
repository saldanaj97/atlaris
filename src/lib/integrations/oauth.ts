import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export interface OAuthTokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope: string;
}

function getEncryptionKey(): Buffer {
  const key = process.env.OAUTH_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('OAUTH_ENCRYPTION_KEY not configured');
  }
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
