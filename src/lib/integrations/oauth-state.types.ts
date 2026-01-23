/**
 * OAuth state store interface for CSRF protection during OAuth flows.
 *
 * Implementations must:
 * - Generate cryptographically secure tokens
 * - Hash tokens before storage (security)
 * - Enforce single-use (atomic consume)
 * - Enforce TTL (10 minutes)
 */
export interface OAuthStateStore {
  /**
   * Issues a new OAuth state token for the given user.
   * The plaintext token is returned; only the hash is stored.
   *
   * @param params.clerkUserId - The Clerk user ID initiating the OAuth flow
   * @param params.provider - Optional provider name for debugging/analytics
   * @returns The plaintext state token to include in the OAuth redirect
   */
  issue(params: { clerkUserId: string; provider?: string }): Promise<string>;

  /**
   * Validates and consumes an OAuth state token.
   * Returns the Clerk user ID if valid, null otherwise.
   * The token is deleted after successful validation (single-use).
   *
   * @param params.stateToken - The plaintext state token from the OAuth callback
   * @returns The Clerk user ID if valid and not expired, null otherwise
   */
  consume(params: { stateToken: string }): Promise<string | null>;
}

/**
 * Parameters for issuing an OAuth state token.
 */
export interface IssueOAuthStateParams {
  clerkUserId: string;
  provider?: string;
}

/**
 * Parameters for consuming an OAuth state token.
 */
export interface ConsumeOAuthStateParams {
  stateToken: string;
}
