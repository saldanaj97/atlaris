import { auth as clerkAuth, currentUser } from '@clerk/nextjs/server';

export type AuthSessionUser = {
  id: string;
  email?: string | null;
  name?: string;
};

export type AuthSessionData = {
  user?: AuthSessionUser | null;
};

export type AuthProviderUser = {
  id: string;
  email: string | null;
  name?: string;
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

  const primaryEmail =
    user.emailAddresses.find(
      (email) => email.id === user.primaryEmailAddressId,
    ) ?? user.emailAddresses[0];

  return primaryEmail?.emailAddress ?? null;
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

export async function getCurrentAuthUserSafe(options?: {
  strict?: boolean;
}): Promise<AuthProviderUser | null> {
  try {
    const user = await currentUser();
    if (!user) return null;

    return {
      id: user.id,
      email: getClerkPrimaryEmail(user),
      name: getClerkUserDisplayName(user),
    };
  } catch (error) {
    if (options?.strict) {
      throw error;
    }
    return null;
  }
}

export async function getStrictAuthUserId(): Promise<string | null> {
  const { userId } = await clerkAuth();
  return userId ?? null;
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
            },
          }
        : null,
    };
  },
};
