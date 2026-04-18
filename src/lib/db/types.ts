import type { drizzle } from 'drizzle-orm/postgres-js';
import type * as schema from '@/lib/db/schema';

export type DbClient = Awaited<ReturnType<typeof drizzle<typeof schema>>>;
