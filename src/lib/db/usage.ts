import { aiUsageEvents, users } from '@/lib/db/schema';
import { getDb } from '@/lib/db/runtime';
import { incrementUsage } from '@/lib/stripe/usage';
import { eq, sql } from 'drizzle-orm';

type DbClient = ReturnType<typeof getDb>;

type RecordUsageParams = {
  userId: string;
  provider: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costCents?: number | null;
  requestId?: string | null;
  kind?: 'plan' | 'regeneration';
};

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
