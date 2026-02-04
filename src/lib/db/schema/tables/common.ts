import { sql } from 'drizzle-orm';

// Clerk JWT subject helper (Clerk user ID)
// Uses pg_session_jwt auth.user_id() which returns the verified JWT sub claim.
// The JWT is validated when establishing the RLS-enforced connection via
// createAuthenticatedRlsClient() in @/lib/db/rls.
export const clerkSub = sql`auth.user_id()`;
