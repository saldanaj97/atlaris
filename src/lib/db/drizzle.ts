// Environment variables are loaded by the calling context:
// - Next.js: automatically loads .env files
// - Workers: should import 'dotenv/config' before importing this module
// - Tests: vitest.config.ts loads .env.test
// This module no longer loads dotenv to avoid conflicts between .env and .env.test
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const connectionString = process.env.DATABASE_URL;

// RLS BYPASS NOTE (for tests):
// When using direct postgres connection (postgres-js), we connect as the database owner/superuser.
// This means Row Level Security (RLS) policies are BYPASSED.
//
// In production: Next.js API routes use Supabase client with user JWT → RLS enforced
// In tests: Direct postgres connection → RLS bypassed (intentional for business logic testing)
//
// RLS policies are tested separately in tests/security/rls.policies.spec.ts using
// authenticated Supabase clients with proper JWT context.
//
// This approach allows:
// 1. Fast, reliable business logic tests without RLS complexity
// 2. Dedicated security tests that verify RLS policies work correctly
export const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
