// Environment variables are loaded by the calling context:
// - Next.js: automatically loads .env files
// - Workers: should import 'dotenv/config' before importing this module
// - Tests: vitest.config.ts loads .env.test
// This module no longer loads dotenv to avoid conflicts between .env and .env.test
import { databaseEnv } from '@/lib/config/env';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import * as schema from './schema';

// SERVICE-ROLE DB CLIENT (RLS BYPASSED)
// This client connects as the database owner/superuser, bypassing Row Level Security (RLS).
//
// USAGE RULES:
// - ✅ Workers/background jobs: Use this client directly (src/workers/**)
// - ✅ Tests: Use this client for business logic testing (RLS bypassed intentionally)
// - ✅ Transactional writes: atomicCheckAndInsertPlan and similar atomic operations
// - ❌ API routes: Use getDb() from @/lib/db/runtime (RLS-enforced via request context)
// - ❌ Request handlers: Use getDb() from @/lib/db/runtime (RLS-enforced)
//
// RLS policies are tested separately in tests/security/rls.policies.spec.ts using
// authenticated Supabase clients with proper JWT context.
//
// This approach allows:
// 1. Fast, reliable business logic tests without RLS complexity
// 2. Dedicated security tests that verify RLS policies work correctly
// 3. Worker processes that need full database access
// 4. Request handlers that enforce tenant isolation via RLS
export const client = neon(databaseEnv.url);
export const db = drizzle(client, { schema });
