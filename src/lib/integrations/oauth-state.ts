import { randomBytes } from 'crypto';
import { LRUCache } from 'lru-cache';

// IMPORTANT: Storage scope and deployment considerations
// - This module uses an in-memory LRU cache for OAuth state tokens. The cache is
//   per-process and volatile. In serverless or multi-instance deployments
//   (e.g., Vercel, container replicas), the OAuth callback may land on a
//   different instance that doesn't have the token in memory, causing validation
//   to fail.
// - For production-grade reliability across instances, use a shared/durable
//   store (e.g., Redis) for the state token mapping, or encode the state into a
//   signed, httpOnly, sameSite=strict cookie and verify the signature on
//   callback. Tokens must remain short-lived and single-use regardless of the
//   storage mechanism.

interface OAuthStateData {
  clerkUserId: string;
  createdAt: number;
}

// In-memory cache for OAuth state tokens
// TTL: 10 minutes (600000ms) - sufficient for OAuth flow completion
// Max size: 1000 entries - prevents memory leaks
const stateTokenCache = new LRUCache<string, OAuthStateData>({
  max: 1000,
  ttl: 600000, // 10 minutes
});

/**
 * Generates a cryptographically secure random token for OAuth state parameter.
 * The token is URL-safe and cannot be easily guessed or manipulated.
 *
 * @returns A secure random token string
 */
export function generateOAuthStateToken(): string {
  // Generate 32 random bytes (256 bits) and encode as base64url
  const randomBytesBuffer = randomBytes(32);
  return randomBytesBuffer.toString('base64url');
}

/**
 * Stores a mapping between an OAuth state token and a Clerk user ID.
 * The mapping expires after 10 minutes to prevent token reuse.
 *
 * @param stateToken - The secure state token
 * @param clerkUserId - The Clerk user ID to associate with the token
 */
export function storeOAuthStateToken(
  stateToken: string,
  clerkUserId: string
): void {
  stateTokenCache.set(stateToken, {
    clerkUserId,
    createdAt: Date.now(),
  });
}

/**
 * Validates and retrieves the Clerk user ID associated with an OAuth state token.
 * Returns null if the token is invalid, expired, or doesn't exist.
 *
 * @param stateToken - The state token from the OAuth callback
 * @returns The Clerk user ID if valid, null otherwise
 */
export function validateOAuthStateToken(stateToken: string): string | null {
  const data = stateTokenCache.get(stateToken);
  if (!data) {
    return null;
  }

  // Return the Clerk user ID and delete the token (one-time use)
  stateTokenCache.delete(stateToken);
  return data.clerkUserId;
}

/**
 * Clears all OAuth state tokens from the cache.
 * Useful for testing or cache invalidation.
 */
export function clearOAuthStateTokens(): void {
  stateTokenCache.clear();
}
