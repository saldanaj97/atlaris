import { atomicInsertPlanOrThrow } from '@tests/helpers/plan-persistence';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { parseModelPricingSnapshot } from '@/features/ai/model-pricing-snapshot';
import { aiUsageEvents, learningPlans } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { canonicalUsageToRecordParams, recordUsage } from '@/lib/db/usage';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';

import { ensureUser } from '../../helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

function hasConstraintViolation(err: unknown, constraintName: string): boolean {
	const parts: string[] = [];
	let current: unknown = err;

	for (let i = 0; i < 6 && current; i++) {
		if (
			current !== null &&
			typeof current === 'object' &&
			'code' in current &&
			(current as { code?: unknown }).code === '23514'
		) {
			return true;
		}

		if (current instanceof Error) {
			parts.push(current.message);
			current = current.cause;
			continue;
		}

		parts.push(String(current));
		break;
	}

	return parts.join('\n').includes(constraintName);
}

async function expectCheckConstraintViolation(
	promise: Promise<unknown>,
	constraintName: string,
): Promise<void> {
	await expect(promise).rejects.toSatisfy((err: unknown) =>
		hasConstraintViolation(err, constraintName),
	);
}

describe('AI usage logging', () => {
	it('atomically checks plan limit, creates plan, and records usage event', async () => {
		const authUserId = buildTestAuthUserId('db-usage');
		const userId = await ensureUser({
			authUserId,
			email: buildTestEmail(authUserId),
		});

		// Check the limit and create the plan in a single atomic transaction
		const plan = await atomicInsertPlanOrThrow(db, userId, {
			topic: 'Test Topic',
			skillLevel: 'beginner',
			weeklyHours: 5,
			learningStyle: 'mixed',
			visibility: 'private',
			origin: 'ai',
		});

		expect(plan.id).toBeDefined();

		const [planRow] = await db
			.select()
			.from(learningPlans)
			.where(eq(learningPlans.id, plan.id));

		expect(planRow?.generationStatus).toBe('generating');
		expect(planRow?.isQuotaEligible).toBe(false);
		expect(planRow?.finalizedAt).toBeNull();

		await recordUsage({
			userId,
			provider: 'mock',
			model: 'mock-generator-v1',
			inputTokens: 10,
			outputTokens: 100,
			costCents: 0,
		});

		const rows = await db
			.select()
			.from(aiUsageEvents)
			.where(eq(aiUsageEvents.userId, userId));
		expect(rows.length).toBe(1);
		expect(rows[0]?.provider).toBe('mock');
	});

	it('round-trips provider_cost_microusd and model_pricing_snapshot from canonical mapping', async () => {
		const authUserId = buildTestAuthUserId('db-usage-snap');
		const userId = await ensureUser({
			authUserId,
			email: buildTestEmail(authUserId),
		});

		const canonical: CanonicalAIUsage = {
			inputTokens: 10,
			outputTokens: 20,
			totalTokens: 30,
			model: 'openai/gpt-4o',
			provider: 'openrouter',
			estimatedCostCents: 3,
			providerCostMicrousd: 1_234_567,
			isPartial: false,
			missingFields: [],
		};

		await recordUsage(canonicalUsageToRecordParams(canonical, userId), db);

		const [row] = await db
			.select()
			.from(aiUsageEvents)
			.where(eq(aiUsageEvents.userId, userId));

		expect(row?.costCents).toBe(3);
		expect(row?.providerCostMicrousd).toEqual(BigInt(1_234_567));
		expect(parseModelPricingSnapshot(row?.modelPricingSnapshot)).toMatchObject({
			version: 1,
			source: 'local_catalog',
			requestedModelId: 'openai/gpt-4o',
		});
	});

	it('rejects negative provider_cost_microusd with CHECK ai_usage_events_provider_cost_microusd_nonneg', async () => {
		const authUserId = buildTestAuthUserId('db-usage-check-microusd');
		const userId = await ensureUser({
			authUserId,
			email: buildTestEmail(authUserId),
		});

		await expectCheckConstraintViolation(
			db.execute(sql`
        INSERT INTO ai_usage_events (user_id, provider, model, input_tokens, output_tokens, cost_cents, provider_cost_microusd)
        VALUES (${userId}, 'test', 'test-model', 0, 0, 0, -1)
      `),
			'ai_usage_events_provider_cost_microusd_nonneg',
		);
	});
});
