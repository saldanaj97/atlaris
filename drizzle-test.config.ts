import dotenv from 'dotenv';
import type { Config } from 'drizzle-kit';

// Load test environment variables as defaults
// Allows runtime DATABASE_URL to override for ephemeral databases
dotenv.config({ path: '.env.local.test' });

export default {
  schema: ['./src/lib/db/schema/index.ts', './src/lib/db/enums.ts'],
  out: './src/lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
