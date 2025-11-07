import type { Config } from 'drizzle-kit';
import dotenv from 'dotenv';

// Load test environment variables and override any values from .env
// Ensures DATABASE_URL from .env.test is used for migrations
dotenv.config({ path: '.env.test', override: true });

export default {
  schema: ['./src/lib/db/schema.ts', './src/lib/db/enums.ts'],
  out: './src/lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
