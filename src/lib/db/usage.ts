import { aiUsageEvents, users } from '@/lib/db/schema';
import { getDb } from '@/lib/db/runtime';
import { incrementUsage } from '@/lib/stripe/usage';
import { eq, sql } from 'drizzle-orm';

type DbClient = ReturnType<typeof getDb>;

export interface EnsureBudgetParams {
  type: 'plan' | 'regeneration';
}

export interface RecordUsageParams {
  userId: string;
  provider: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costCents?: number | null;
  requestId?: string | null;
  kind?: 'plan' | 'regeneration';
}

export async function recordUsage(
  params: RecordUsageParams,
  dbClient: DbClient = getDb()
): Promise<void> {
  await dbClient.insert(aiUsageEvents).values({
    userId: params.userId,
    provider: params.provider,
    model: params.model,
    inputTokens: params.inputTokens ?? 0,
    outputTokens: params.outputTokens ?? 0,
    costCents: params.costCents ?? 0,
    requestId: params.requestId ?? null,
  });

  if (params.kind) {
    // Update monthly aggregate counters
    await incrementUsage(params.userId, params.kind, dbClient);
  }
}

const TIER_LIMITS: Record<'free' | 'starter' | 'pro', number> = {
  free: 2,
  starter: 10,
  pro: Infinity,
};

export async function checkExportQuota(
  userId: string,
  tier: 'free' | 'starter' | 'pro',
  dbClient: DbClient = getDb()
): Promise<boolean> {
  const limit = TIER_LIMITS[tier];

  if (limit === Infinity) {
    return true;
  }

  const [result] = await dbClient
    .select({ exportCount: users.monthlyExportCount })
    .from(users)
    .where(eq(users.id, userId));

  return (result?.exportCount ?? 0) < limit;
}

export async function incrementExportUsage(
  userId: string,
  dbClient: DbClient = getDb()
): Promise<void> {
  const updated = await dbClient
    .update(users)
    .set({
      monthlyExportCount: sql`${users.monthlyExportCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  if (!updated.length) {
    throw new Error(
      `Failed to increment export usage: user ${userId} not found`
    );
  }
}

export async function resetMonthlyExportCounts(
  dbClient: DbClient = getDb()
): Promise<void> {
  await dbClient.update(users).set({ monthlyExportCount: 0 });
}
