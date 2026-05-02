import { sql } from 'drizzle-orm';

// Auth user ID from JWT claims
// Uses PostgreSQL session variable `request.jwt.claims` for RLS (app-set; not provider auth.jwt())
// The JWT claims must be set when establishing the RLS-enforced connection
// via the createRlsClient() function in @/lib/db/rls
export const currentUserId = sql`current_setting('request.jwt.claims', true)::json->>'sub'`;
