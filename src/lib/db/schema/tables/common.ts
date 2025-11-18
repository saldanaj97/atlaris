import { sql } from 'drizzle-orm';

// Clerk JWT subject helper (Clerk user ID)
// Uses PostgreSQL session variable instead of Supabase-specific auth.jwt()
// The JWT claims must be set when establishing the RLS-enforced connection
// via the createRlsClient() function in @/lib/db/rls
export const clerkSub = sql`current_setting('request.jwt.claims', true)::json->>'sub'`;

// Note: We no longer use Supabase-specific roles (authenticated, anon, service_role)
// for RLS policies in Neon. Instead:
// - RLS policies check the session variable only (no 'to:' parameter)
// - Service-role operations use the bypass client from @/lib/db/drizzle (bypasses RLS)
// - Request handlers use createRlsClient() from @/lib/db/rls (enforces RLS)
