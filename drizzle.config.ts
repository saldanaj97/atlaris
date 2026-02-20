import dotenv from 'dotenv';
import type { Config } from 'drizzle-kit';

// Load local env files only outside CI. CI relies on preset env vars.
if (!process.env.CI) {
  dotenv.config({
    path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env.local',
  });
}

// Prefer direct connection URLs for migrations (avoids connection pooler issues with DDL),
// with fallbacks for environments that only provide pooled DATABASE_URL.
const databaseUrl =
  process.env.DATABASE_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL_NON_POOLING, DATABASE_URL_UNPOOLED, or DATABASE_URL must be set for migrations'
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
