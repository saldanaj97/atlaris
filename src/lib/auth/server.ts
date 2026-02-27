import { createNeonAuth } from '@neondatabase/auth/next/server';
import { neonAuthEnv } from '@/lib/config/env';

export const auth = createNeonAuth({
  baseUrl: neonAuthEnv.baseUrl,
  cookies: {
    secret: neonAuthEnv.cookieSecret,
  },
});

/**
 * Read-only session accessor safe for Server Components.
 *
 * `auth.getSession()` may attempt to refresh cookies when the session-data
 * cache expires.  Cookie writes are forbidden outside Server Actions / Route
 * Handlers, so the call throws in plain Server Components.
 *
 * This wrapper catches that error and returns `null`, letting the caller
 * degrade gracefully (e.g. show unauthenticated UI).  The session will be
 * properly refreshed on the next Route Handler or client-side fetch.
 */
export async function getSessionSafe(options?: { strict?: boolean }): Promise<{
  session: { user: { id: string } } | null;
}> {
  try {
    const { data } = await auth.getSession();
    return { session: data };
  } catch (error) {
    if (options?.strict) {
      throw error;
    }
    return { session: null };
  }
}
