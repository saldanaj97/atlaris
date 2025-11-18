import { sql } from 'drizzle-orm';
import { anonRole, authenticatedRole, serviceRole } from 'drizzle-orm/supabase';

// Clerk JWT subject helper (Clerk user ID)
// Uses PostgreSQL session variable instead of Supabase-specific auth.jwt()
// The JWT claims must be set via SET LOCAL request.jwt.claims = '...' when establishing the connection
export const clerkSub = sql`current_setting('request.jwt.claims', true)::json->>'sub'`;

export { anonRole, authenticatedRole, serviceRole };
