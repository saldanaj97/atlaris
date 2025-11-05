## Task 4: Shared OAuth Infrastructure - Token Encryption Utility

**Files:**

- Create: `src/lib/integrations/oauth.ts`
- Create: `tests/unit/integrations/oauth.spec.ts`

**Step 1: Write failing test for token encryption**

Create `tests/unit/integrations/oauth.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  encryptToken,
  decryptToken,
  OAuthTokenData,
} from '@/lib/integrations/oauth';

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
    expect(decrypted.expiresAt.toISOString()).toBe(
      mockToken.expiresAt.toISOString()
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
      'OAUTH_ENCRYPTION_KEY not configured'
    );

    process.env.OAUTH_ENCRYPTION_KEY = originalKey;
  });

  it('should throw error on invalid ciphertext', () => {
    expect(() => decryptToken('invalid_ciphertext')).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/unit/integrations/oauth.spec.ts
```

Expected: FAIL - "Cannot find module '@/lib/integrations/oauth'"

**Step 3: Write minimal implementation**

Create `src/lib/integrations/oauth.ts`:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

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

  // Return: IV + encrypted data (hex encoded)
  return iv.toString('hex') + ':' + encrypted;
}

export function decryptToken(encryptedData: string): OAuthTokenData {
  const key = getEncryptionKey();
  const parts = encryptedData.split(':');

  if (parts.length !== 2) {
    throw new Error('Invalid encrypted token format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  const parsed = JSON.parse(decrypted);

  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
    scope: parsed.scope,
  };
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/unit/integrations/oauth.spec.ts
```

Expected: PASS - All 4 tests passing

**Step 5: Run Coderabbit CLI and implement suggestions**

Run `coderabbit --prompt-only -t uncommitted` and implement any suggestions from the review.

**Step 6: Commit**

```bash
git add src/lib/integrations/oauth.ts tests/unit/integrations/oauth.spec.ts
git commit -m "feat(oauth): add AES-256 token encryption utilities

Implement secure encryption/decryption for OAuth tokens using AES-256-CBC
with random IVs. Supports access tokens, refresh tokens, expiry, and scope.

Changes:
- Add encryptToken/decryptToken functions with AES-256-CBC
- Use random IV per encryption for semantic security
- Validate encryption key presence and format

New files:
- src/lib/integrations/oauth.ts
- tests/unit/integrations/oauth.spec.ts

Tests cover:
- Successful encryption/decryption round-trip
- Different ciphertext for same plaintext (IV randomness)
- Error handling for missing encryption key
- Error handling for invalid ciphertext"
```

**Step 7: Open PR into main**

Create a pull request from the current branch into main, following the commit message guidelines.

---
