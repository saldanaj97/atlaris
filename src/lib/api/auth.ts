import { createRequestContext, withRequestContext } from '@/lib/api/context';
import type {
	AuthHandler,
	AuthHandlerContext,
	PlainHandler,
	RouteHandlerContext,
} from '@/lib/api/types/auth.types';
import { auth, getSessionSafe } from '@/lib/auth/server';
import { appEnv, devAuthEnv, localProductTestingEnv } from '@/lib/config/env';
import type { DbUser, UsersDbClient } from '@/lib/db/queries/types/users.types';
import { createUser, getUserByAuthId } from '@/lib/db/queries/users';
import type { RlsClient } from '@/lib/db/rls';
import { getDb } from '@/lib/db/runtime';
import type { DbClient } from '@/lib/db/types';
import { AuthError } from './errors';

export type { PlainHandler } from '@/lib/api/types/auth.types';

type MaybePromise<T> = T | Promise<T>;

/**
 * Returns the effective auth user id for the current request.
 * In development or test (Vitest), if DEV_AUTH_USER_ID is set, that value is returned
 * (allowing you to bypass real Neon auth provisioning while seeding a deterministic user).
 */
export async function getEffectiveAuthUserId(options?: {
	strict?: boolean;
}): Promise<string | null> {
	if (appEnv.vitestWorkerId) {
		const devUserId = devAuthEnv.userId;
		return devUserId || null;
	}

	if (appEnv.isDevelopment) {
		const devUserId = devAuthEnv.userId;
		if (devUserId !== undefined) {
			return devUserId || null;
		}
	}

	const { session } = await getSessionSafe({ strict: options?.strict });
	return session?.user?.id ?? null;
}

/**
 * Returns the auth user id from the actual Neon session, ignoring
 * DEV_AUTH_USER_ID overrides. This is intended for security-sensitive flows
 * (e.g. OAuth callbacks) where we must validate the currently authenticated
 * end user rather than a test/development override.
 *
 * Only call from Route Handlers or Server Actions (not Server Components).
 *
 * @public Intentional library surface for OAuth and security-sensitive flows (see docs).
 */
export async function getAuthUserId(): Promise<string | null> {
	const { data: session } = await auth.getSession();
	return session?.user?.id ?? null;
}

/**
 * Resolves the current auth user ID or throws AuthError.
 * Used internally by `withAuth` and `requireCurrentUserRecord`.
 */
async function requireUser(): Promise<string> {
	const userId = await getEffectiveAuthUserId({ strict: true });
	if (!userId) throw new AuthError();
	return userId;
}

async function ensureUserRecord(
	authUserId: string,
	dbClient?: UsersDbClient,
): Promise<DbUser> {
	const existing = await getUserByAuthId(authUserId, dbClient);
	if (existing) {
		return existing;
	}

	if (localProductTestingEnv.enabled) {
		throw new AuthError(
			'Local product testing requires a seeded user row for DEV_AUTH_USER_ID. Run pnpm db:dev:bootstrap and set DEV_AUTH_USER_ID to the seed auth id (see localProductTestingEnv.seed in @/lib/config/env).',
		);
	}

	const { data: session } = await auth.getSession();

	if (!session?.user) {
		throw new AuthError('Auth user data unavailable.');
	}

	const email = session.user.email;
	if (!email) {
		throw new AuthError('Auth user must have an email address.');
	}

	const created = await createUser(
		{
			authUserId,
			email,
			name: session.user.name || undefined,
		},
		dbClient,
	);

	if (!created) {
		throw new AuthError('Failed to provision user record.');
	}

	return created;
}

export async function requireCurrentUserRecord(): Promise<DbUser> {
	const userId = await requireUser();
	return ensureUserRecord(userId);
}

/**
 * Private helper encapsulating shared auth + RLS + context + cleanup logic
 * used by withAuth, withServerComponentContext, and withServerActionContext.
 */
async function runWithAuthenticatedContext<T>(
	authUserId: string,
	fn: (user: DbUser, rlsDb: RlsClient) => MaybePromise<T>,
	req?: Request,
): Promise<T> {
	const { createAuthenticatedRlsClient } = await import('@/lib/db/rls');
	const { db: rlsDb, cleanup } = await createAuthenticatedRlsClient(authUserId);

	const requestContext = createRequestContext(req, {
		userId: authUserId,
		db: rlsDb,
		cleanup,
	});

	try {
		return await withRequestContext(requestContext, async () => {
			const user = await ensureUserRecord(authUserId, rlsDb);
			requestContext.user = { id: user.id, authUserId: user.authUserId };
			return fn(user, rlsDb);
		});
	} finally {
		await cleanup();
	}
}

async function runWithTestContext<T>(
	authUserId: string,
	fn: (user: DbUser, db: DbClient) => MaybePromise<T>,
	req?: Request,
): Promise<T> {
	const requestDb = getDb();
	const user = await ensureUserRecord(authUserId, requestDb);
	const requestContext = createRequestContext(req, {
		userId: authUserId,
		user: { id: user.id, authUserId: user.authUserId },
		db: requestDb,
		cleanup: async () => {},
	});

	return withRequestContext(requestContext, () => fn(user, requestDb));
}

type RouteHandlerParams = AuthHandlerContext['params'];

export function withAuth(handler: AuthHandler): PlainHandler {
	return async (req: Request, routeContext?: RouteHandlerContext) => {
		const params: RouteHandlerParams = routeContext?.params
			? await routeContext.params
			: {};

		if (appEnv.isTest) {
			const authUserId = await requireUser();

			return runWithTestContext(
				authUserId,
				(user) => handler({ req, userId: authUserId, user, params }),
				req,
			);
		}

		const authUserId = await requireUser();

		return runWithAuthenticatedContext(
			authUserId,
			(user) => handler({ req, userId: authUserId, user, params }),
			req,
		);
	};
}

/**
 * Establishes an RLS-enforced DB context for Server Components.
 * This is the Server Component equivalent of `withAuth` for API routes.
 *
 * Returns null if the user is not authenticated.
 */
export async function withServerComponentContext<T>(
	fn: (user: DbUser) => MaybePromise<T>,
): Promise<T | null> {
	const authUserId = await getEffectiveAuthUserId();
	if (!authUserId) return null;

	if (appEnv.isTest) {
		return runWithTestContext(authUserId, (user) => fn(user));
	}

	return runWithAuthenticatedContext(authUserId, (user) => fn(user));
}

/**
 * Wrapper for Server Actions that sets up authenticated RLS context.
 * Equivalent to withServerComponentContext but designed for 'use server' functions.
 * Handles auth, RLS client creation, user lookup, and cleanup.
 *
 * Also passes the RLS db client to the callback since server actions
 * often need to pass it explicitly to query functions.
 *
 * Returns null if user is not authenticated (caller should handle).
 */
export async function withServerActionContext<T>(
	fn: (user: DbUser, db: RlsClient) => MaybePromise<T>,
): Promise<T | null> {
	const authUserId = await getEffectiveAuthUserId({ strict: true });
	if (!authUserId) return null;

	if (appEnv.isTest) {
		return runWithTestContext(authUserId, fn);
	}

	return runWithAuthenticatedContext(authUserId, fn);
}
