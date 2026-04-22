/**
 * Integration proof: whether `request.jwt.claims` set session-wide in
 * `createAuthenticatedRlsClient` remains visible inside `dbClient.transaction()`
 * without calling `reapplyJwtClaimsInTransaction`.
 *
 * This validates behavior against **Testcontainers Postgres** (integration test
 * runtime). Neon serverless or other poolers may differ; production may still
 * require the re-apply workaround until verified there.
 */

import { eq, type SQLWrapper, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { learningPlans } from '@/lib/db/schema';
import { createTestPlan } from '../../fixtures/plans';
import { ensureUser } from '../../helpers/db';
import {
	cleanupTrackedRlsClients,
	createRlsDbForUser,
} from '../../helpers/rls';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

const LOG_PREFIX = '[rls-claim-stability]';

type JwtClaimsRow = { claims: string | null };

type ClaimsExecutor = {
	execute: (query: SQLWrapper) => PromiseLike<unknown>;
};

function isJwtClaimsRowArray(value: unknown): value is JwtClaimsRow[] {
	if (!Array.isArray(value) || value.length === 0) {
		return false;
	}
	const first = value[0];
	return (
		first !== null &&
		typeof first === 'object' &&
		'claims' in first &&
		(typeof (first as JwtClaimsRow).claims === 'string' ||
			(first as JwtClaimsRow).claims === null)
	);
}

/**
 * Reads `request.jwt.claims` the same way as `prepareRlsTransactionContext`.
 */
async function readJwtClaims(executor: ClaimsExecutor): Promise<string | null> {
	const result = await executor.execute(
		sql`SELECT current_setting('request.jwt.claims', true) AS claims`,
	);
	if (!isJwtClaimsRowArray(result)) {
		return null;
	}
	const raw = result[0]?.claims;
	if (typeof raw === 'string' && raw.length > 0) {
		return raw;
	}
	return null;
}

function logClaimComparison(
	scenario: string,
	expected: string,
	actual: string | null,
): void {
	console.info(
		`${LOG_PREFIX} ${scenario} — expected: ${expected} | read: ${actual === null ? '(null)' : actual}`,
	);
}

describe('RLS JWT claim transaction stability — Testcontainers Postgres', () => {
	let authUserId: string;
	let internalUserId: string;
	let planId: string;
	let expectedClaims: string;
	let rlsDb: Awaited<ReturnType<typeof createRlsDbForUser>>;

	beforeEach(async () => {
		authUserId = buildTestAuthUserId('rls-claim-stability');
		internalUserId = await ensureUser({
			authUserId,
			email: buildTestEmail(authUserId),
		});
		const plan = await createTestPlan({
			userId: internalUserId,
			topic: 'RLS claim stability plan',
		});
		planId = plan.id;
		expectedClaims = JSON.stringify({ sub: authUserId });
		rlsDb = await createRlsDbForUser(authUserId);
	});

	afterEach(async () => {
		await cleanupTrackedRlsClients();
	});

	it('session-level JWT claims match outside any transaction', async () => {
		const actual = await readJwtClaims(rlsDb);
		logClaimComparison('baseline', expectedClaims, actual);
		expect(actual).toBe(expectedClaims);
	});

	it('session-level JWT claims are visible inside dbClient.transaction without re-application', async () => {
		const actual = await rlsDb.transaction(async (tx) => {
			return readJwtClaims(tx);
		});
		logClaimComparison('simple_transaction', expectedClaims, actual);
		expect(actual).toBe(expectedClaims);
	});

	it('JWT claims remain visible after pg_advisory_xact_lock inside transaction', async () => {
		const actual = await rlsDb.transaction(async (tx) => {
			await tx.execute(
				sql`SELECT pg_advisory_xact_lock(1, hashtext(${internalUserId}))`,
			);
			return readJwtClaims(tx);
		});
		logClaimComparison('advisory_lock', expectedClaims, actual);
		expect(actual).toBe(expectedClaims);
	});

	it('RLS-protected SELECT returns owned plan inside transaction without re-applying claims', async () => {
		await rlsDb.transaction(async (tx) => {
			const claimsInTx = await readJwtClaims(tx);
			logClaimComparison('before_rls_select', expectedClaims, claimsInTx);
			expect(claimsInTx).toBe(expectedClaims);

			const rows = await tx
				.select({
					id: learningPlans.id,
					userId: learningPlans.userId,
				})
				.from(learningPlans)
				.where(eq(learningPlans.id, planId));

			expect(rows).toHaveLength(1);
			expect(rows[0]?.userId).toBe(internalUserId);
		});
	});

	it('session-level JWT claims are visible inside nested transaction (savepoint)', async () => {
		const actual = await rlsDb.transaction(async (tx) => {
			return tx.transaction(async (innerTx) => {
				return readJwtClaims(innerTx);
			});
		});
		logClaimComparison('nested_savepoint', expectedClaims, actual);
		expect(actual).toBe(expectedClaims);
	});
});
