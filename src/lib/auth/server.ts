import { auth as clerkAuth, currentUser } from '@clerk/nextjs/server';

export type AuthSessionUser = {
  id: string;
  email?: string | null;
  name?: string;
  clerkUserUpdatedAt?: Date;
};

export type AuthSessionData = {
  user?: AuthSessionUser | null;
};

type AuthProviderUser = {
  id: string;
  email: string | null;
  name?: string;
  clerkUserUpdatedAt: Date;
};

type AuthSessionResult = {
  data: AuthSessionData | null;
};

function getClerkUserDisplayName(
  user: Awaited<ReturnType<typeof currentUser>>,
) {
  if (!user) return undefined;
  const composedName = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(' ');
  return (user.fullName ?? composedName) || user.username || undefined;
}

function getClerkPrimaryEmail(
  user: Awaited<ReturnType<typeof currentUser>>,
): string | null {
  if (!user) return null;

  const primaryEmail = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId,
  );

  return primaryEmail?.verification?.status === 'verified'
    ? primaryEmail.emailAddress
    : null;
}

/**
 * Read-only session accessor safe for Server Components.
 */
export async function getSessionSafe(options?: { strict?: boolean }): Promise<{
  session: AuthSessionData | null;
}> {
  try {
    const { userId } = await clerkAuth();
    return { session: userId ? { user: { id: userId } } : null };
  } catch (error) {
    if (options?.strict) {
      throw error;
    }
    return { session: null };
  }
}

/**
 * Whether the Clerk session for `authUserId` has a plan feature. A signed-out
 * request, or a session for another user (a DEV_AUTH_USER_ID override), has
 * none. Throws when Clerk auth is unavailable, so callers can tell that apart
 * from a missing feature.
 */
export async function hasClerkPlanFeature(
  authUserId: string,
  feature: string,
): Promise<boolean> {
  const { userId, has } = await clerkAuth();
  return userId === authUserId && has({ feature });
}

async function getCurrentAuthUserSafe(options?: {
  strict?: boolean;
}): Promise<AuthProviderUser | null> {
  try {
    const user = await currentUser();
    if (!user) return null;

    return {
      id: user.id,
      email: getClerkPrimaryEmail(user),
      name: getClerkUserDisplayName(user),
      clerkUserUpdatedAt: new Date(user.updatedAt),
    };
  } catch (error) {
    if (options?.strict) {
      throw error;
    }
    return null;
  }
}

export const auth = {
  async getSession(): Promise<AuthSessionResult> {
    const authUser = await getCurrentAuthUserSafe({ strict: true });
    return {
      data: authUser
        ? {
            user: {
              id: authUser.id,
              email: authUser.email,
              name: authUser.name,
              clerkUserUpdatedAt: authUser.clerkUserUpdatedAt,
            },
          }
        : null,
    };
  },
};
