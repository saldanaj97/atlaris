import {
  decryptToken,
  encryptToken,
  OAuthTokenData,
} from '@/lib/integrations/oauth';
import { describe, expect, it } from 'vitest';

describe('OAuth Token Encryption', () => {
  const mockToken: OAuthTokenData = {
    accessToken: 'test_access_token_12345',
    refreshToken: 'test_refresh_token_67890',
    expiresAt: new Date('2025-12-31T23:59:59Z'),
    scope: 'read write',
  };

  it('should encrypt and decrypt token successfully', () => {
    const encrypted = encryptToken(mockToken);
    const decrypted = decryptToken(encrypted);

    expect(decrypted.accessToken).toBe(mockToken.accessToken);
    expect(decrypted.refreshToken).toBe(mockToken.refreshToken);
    expect(decrypted.expiresAt?.toISOString()).toBe(
      mockToken.expiresAt?.toISOString()
    );
    expect(decrypted.scope).toBe(mockToken.scope);
  });

  it('should produce different ciphertext for same plaintext', () => {
    const encrypted1 = encryptToken(mockToken);
    const encrypted2 = encryptToken(mockToken);

    expect(encrypted1).not.toBe(encrypted2); // Different IV each time
  });

  it('should throw error if encryption key is missing', () => {
    const originalKey = process.env.OAUTH_ENCRYPTION_KEY;
    delete process.env.OAUTH_ENCRYPTION_KEY;

    expect(() => encryptToken(mockToken)).toThrow(
      'Missing required environment variable: OAUTH_ENCRYPTION_KEY'
    );

    process.env.OAUTH_ENCRYPTION_KEY = originalKey;
  });

  it('should throw error on invalid ciphertext', () => {
    expect(() => decryptToken('invalid_ciphertext')).toThrow();
  });
});
