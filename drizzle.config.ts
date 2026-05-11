import dotenv from 'dotenv';
import type { Config } from 'drizzle-kit';

// Load local env files only outside CI. CI relies on preset env vars.
// TODO: Find a way to load the staging and prod db urls for migrations using { path: ['.env.local', '.env'] }
if (!process.env.CI) {
  dotenv.config({
    path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env.local',
  });
}

// Prefer direct connection URLs for migrations (avoids connection pooler issues with DDL),
// with fallbacks for environments that only provide pooled POSTGRES_URL.
const databaseUrl =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error(
    'POSTGRES_URL_NON_POOLING or POSTGRES_URL must be set for migrations',
  );
}

export default {
  schema: ['./supabase/schema/index.ts', './supabase/enums.ts'],
  out: './supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
} satisfies Config;
