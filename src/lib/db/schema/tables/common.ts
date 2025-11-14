import { sql } from 'drizzle-orm';
import { anonRole, authenticatedRole, serviceRole } from 'drizzle-orm/supabase';

// Clerk JWT subject helper (Clerk user ID)
export const clerkSub = sql`(select auth.jwt()->>'sub')`;

export { anonRole, authenticatedRole, serviceRole };
