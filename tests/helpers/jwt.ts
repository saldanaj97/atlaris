/**
 * JWT Test Utilities for RLS Testing
 *
 * Generates test JWTs that match Clerk's JWT structure to test RLS policies.
 * These JWTs are signed with a test secret and include the minimal claims
 * needed for Supabase RLS policies to work.
 *
 * In production:
 * - Clerk issues JWTs signed with Clerk's secret
 * - Supabase validates using Clerk's JWKS endpoint
 * - RLS policies extract user ID from JWT via auth.jwt()->>'sub'
 *
 * In tests:
 * - We generate JWTs signed with TEST_JWT_SECRET
 * - Supabase validates using the same TEST_JWT_SECRET
 * - RLS policies work identically to production
 */

import jwt from 'jsonwebtoken';

/**
 * Gets the JWT secret for signing test tokens.
 *
 * IMPORTANT: For Supabase RLS testing to work, we need to use Supabase's JWT secret.
 * The easiest way is to decode the service_role key to extract the secret, OR
 * get the JWT secret from Supabase dashboard → Settings → API → JWT Secret.
 *
 * For now, this function tries to:
 * 1. Use TEST_JWT_SECRET if explicitly set to Supabase's JWT secret
 * 2. Decode the SUPABASE_SERVICE_ROLE_KEY to extract the secret
 * 3. Fall back to a default (which won't work for RLS tests)
 */
function getTestJwtSecret(): string {
  // Option 1: Use explicitly configured secret
  const explicitSecret = process.env.TEST_JWT_SECRET;
  if (explicitSecret && explicitSecret.length > 32) {
    return explicitSecret;
  }

  // Option 2: Try to decode service_role key to extract the secret
  // The service_role key is a JWT signed with Supabase's JWT secret
  // We can decode it (without verification) to see what it contains,
  // but we can't extract the secret from it directly.
  //
  // The proper way is to get the JWT secret from Supabase dashboard:
  // https://supabase.com/dashboard/project/ulfujbbaiycqomnapxjp/settings/api
  //
  // Look for "JWT Secret" - it's a long base64-encoded string

  // For now, return a placeholder that will cause tests to fail with a clear message
  throw new Error(
    'TEST_JWT_SECRET not configured. ' +
      'RLS tests require Supabase JWT secret. ' +
      'Get it from: https://supabase.com/dashboard/project/ulfujbbaiycqomnapxjp/settings/api → JWT Secret ' +
      'Add to .env.test: TEST_JWT_SECRET="your-supabase-jwt-secret-here"'
  );
}

export interface TestClerkJwtPayload {
  /** Clerk user ID - extracted by RLS policies via auth.jwt()->>'sub' */
  sub: string;
  /** Issuer - typically Clerk's domain */
  iss?: string;
  /** Issued at timestamp */
  iat?: number;
  /** Expiration timestamp */
  exp?: number;
  /** Additional Clerk claims if needed */
  [key: string]: unknown;
}

/**
 * Generates a test JWT that matches Clerk's structure.
 *
 * The JWT includes:
 * - `sub`: Clerk user ID (e.g., "user_2abc123")
 * - `iss`: Issuer (Clerk domain)
 * - `iat`: Issued at time
 * - `exp`: Expiration time (1 hour from now)
 *
 * @param clerkUserId - The Clerk user ID to include in the JWT
 * @param additionalClaims - Any additional claims to include
 * @returns Signed JWT token string
 *
 * @example
 * ```typescript
 * const token = generateTestClerkJwt('user_2abc123');
 * // Use token in Authorization header: `Bearer ${token}`
 * ```
 */
export function generateTestClerkJwt(
  clerkUserId: string,
  additionalClaims: Partial<TestClerkJwtPayload> = {}
): string {
  const secret = getTestJwtSecret();

  // Validate required environment variables
  const clerkIssuer = process.env.CLERK_ISSUER;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!clerkIssuer) {
    throw new Error(
      'CLERK_ISSUER not set in .env.test. ' +
        'This must match the issuer configured in Supabase dashboard. ' +
        'Example: CLERK_ISSUER=https://kind-wahoo-35.clerk.accounts.dev'
    );
  }

  if (!supabaseUrl) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL not set in .env.test. ' +
        'This is required for JWT audience (aud) and authorized party (azp) claims.'
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const oneHourFromNow = now + 3600;

  const payload: TestClerkJwtPayload = {
    sub: clerkUserId,
    iss: clerkIssuer, // Must match Supabase JWT provider config
    aud: supabaseUrl, // Supabase project URL
    azp: supabaseUrl, // Authorized party
    role: 'authenticated', // Required by Supabase for third-party auth
    iat: now,
    exp: oneHourFromNow,
    // Clerk-specific claims for realism
    sid: `sess_test_${Date.now()}`, // Session ID
    org_id: null, // Organization (if applicable)
    org_role: null,
    org_slug: null,
    ...additionalClaims,
  };

  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
  });
}

/**
 * Verifies and decodes a test JWT.
 * Useful for debugging JWT issues in tests.
 *
 * @param token - The JWT token to verify
 * @returns Decoded JWT payload
 */
export function verifyTestJwt(token: string): TestClerkJwtPayload {
  const secret = getTestJwtSecret();
  return jwt.verify(token, secret) as TestClerkJwtPayload;
}
