import type { RlsClient } from '../../../supabase/rls';
import type {
  AuthHandler,
  AuthHandlerContext,
  PlainHandler,
  RouteHandlerContext,
} from '@/lib/api/types/auth.types';
import type {
  ActorUser,
  UsersDbClient,
} from '@/lib/db/queries/types/users.types';
import type { DbClient } from '@/lib/db/types';

import { AuthError, DeletedAuthUserError } from './errors';
import { provisionUserFromVerifiedAuthSession } from '@/features/auth/user-provisioning';
import { createRequestContext, withRequestContext } from '@/lib/api/context';
import { assertSameOriginMutation } from '@/lib/api/request-origin';
import { auth, getSessionSafe } from '@/lib/auth/server';
import { appEnv, devAuthEnv, localProductTestingEnv } from '@/lib/config/env';
import { getUserByAuthId } from '@/lib/db/queries/users';
import { getDb } from '@supabase/runtime';

export type { PlainHandler } from '@/lib/api/types/auth.types';

type MaybePromise<T> = T | Promise<T>;

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

export async function getAuthUserId(): Promise<string | null> {
  const { data: session } = await auth.getSession();
  return session?.user?.id ?? null;
}

async function requireUser(): Promise<string> {
  const userId = await getEffectiveAuthUserId({ strict: true });
  if (!userId) throw new AuthError();
  return userId;
}

async function ensureUserRecord(
  authUserId: string,
  dbClient: UsersDbClient,
): Promise<ActorUser> {
  const existing = await getUserByAuthId(authUserId, dbClient);
  if (existing) {
    if (existing.clerkDeletedAt !== null) {
      throw new DeletedAuthUserError();
    }
    return existing;
  }

  if (localProductTestingEnv.enabled) {
    throw new AuthError(
      'Local product testing requires a seeded user row for DEV_AUTH_USER_ID. Run pnpm db seed and set DEV_AUTH_USER_ID to the seed auth id (see localProductTestingEnv.seed in @/lib/config/env).',
    );
  }

  const { data: session } = await auth.getSession();

  if (!session?.user) {
    throw new AuthError('Auth user data unavailable.');
  }

  if (session.user.id !== authUserId) {
    throw new AuthError('Auth user changed during provisioning.');
  }

  const email = session.user.email;
  if (!email) {
    throw new AuthError(
      'Auth user must have a verified primary email address.',
    );
  }

  const clerkUserUpdatedAt = session.user.clerkUserUpdatedAt;
  if (!clerkUserUpdatedAt) {
    throw new AuthError('Auth user timestamp unavailable.');
  }

  const actor = await provisionUserFromVerifiedAuthSession({
    authUserId,
    email,
    name: session.user.name || undefined,
    clerkUserUpdatedAt,
  });

  if (!actor) {
    throw new AuthError('Failed to provision user record.');
  }

  return actor;
}

/**
 * Private helper encapsulating shared auth + RLS + context + cleanup logic
 * used by withAuth, runServerComponentContext, and withServerActionContext.
 */
async function runWithAuthenticatedContext<T>(
  authUserId: string,
  fn: (user: ActorUser, rlsDb: RlsClient) => MaybePromise<T>,
  req?: Request,
): Promise<T> {
  const { createAuthenticatedRlsClient } =
    await import('../../../supabase/rls');
  const { db: rlsDb, cleanup } = await createAuthenticatedRlsClient(authUserId);

  const requestContext = createRequestContext(req, {
    userId: authUserId,
    db: rlsDb,
    cleanup,
  });

  try {
    return await withRequestContext(requestContext, async () => {
      const user = await ensureUserRecord(authUserId, rlsDb);
      requestContext.user = user;
      return fn(user, rlsDb);
    });
  } finally {
    await cleanup();
  }
}

async function runWithTestContext<T>(
  authUserId: string,
  fn: (user: ActorUser, db: DbClient) => MaybePromise<T>,
  req?: Request,
): Promise<T> {
  const requestDb = getDb();
  const user = await ensureUserRecord(authUserId, requestDb);
  const requestContext = createRequestContext(req, {
    userId: authUserId,
    user,
    db: requestDb,
    cleanup: async () => {},
  });

  return withRequestContext(requestContext, () => fn(user, requestDb));
}

type RouteHandlerParams = AuthHandlerContext['params'];

export function withAuth(handler: AuthHandler): PlainHandler {
  return async (req: Request, routeContext?: RouteHandlerContext) => {
    assertSameOriginMutation(req);

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
 * @internal Used by `requestBoundary.component()`.
 *
 * Establishes an RLS-enforced DB context for Server Components.
 * Returns null if the user is not authenticated.
 */
export async function runServerComponentContext<T>(
  fn: (user: ActorUser) => MaybePromise<T>,
): Promise<T | null> {
  const authUserId = await getEffectiveAuthUserId({ strict: true });
  if (!authUserId) return null;

  if (appEnv.isTest) {
    return runWithTestContext(authUserId, (user) => fn(user));
  }

  return runWithAuthenticatedContext(authUserId, (user) => fn(user));
}

export async function withServerActionContext<T>(
  fn: (user: ActorUser, db: RlsClient) => MaybePromise<T>,
): Promise<T | null> {
  const authUserId = await getEffectiveAuthUserId({ strict: true });
  if (!authUserId) return null;

  if (appEnv.isTest) {
    return runWithTestContext(authUserId, fn);
  }

  return runWithAuthenticatedContext(authUserId, fn);
}
