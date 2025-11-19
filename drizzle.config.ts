import dotenv from 'dotenv';
import type { Config } from 'drizzle-kit';

// Load local env files only outside CI. CI relies on preset env vars.
if (!process.env.CI) {
  dotenv.config({
    path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env.local',
  });
}

if (!process.env.DATABASE_URL_NON_POOLING) {
  throw new Error('DATABASE_URL_NON_POOLING is not set');
}

export default {
  schema: ['./src/lib/db/schema/index.ts', './src/lib/db/enums.ts'],
  out: './src/lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_NON_POOLING,
  },
} satisfies Config;
