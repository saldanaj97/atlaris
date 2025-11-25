import dotenv from 'dotenv';
import type { Config } from 'drizzle-kit';

// Load local env files only outside CI. CI relies on preset env vars.
if (!process.env.CI) {
  dotenv.config({
    path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env.local',
  });
}

// Prefer DATABASE_URL_NON_POOLING for migrations (avoids connection pooler issues with DDL),
// but fall back to DATABASE_URL if only that is provided (e.g., in CI environments).
const databaseUrl =
  process.env.DATABASE_URL_NON_POOLING || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL_NON_POOLING or DATABASE_URL must be set for migrations'
  );
}

export default {
  schema: ['./src/lib/db/schema/index.ts', './src/lib/db/enums.ts'],
  out: './src/lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
} satisfies Config;
