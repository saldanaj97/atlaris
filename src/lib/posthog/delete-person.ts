import type { Logger } from '@/lib/logging/logger';

/**
 * The production PostHog project (US cloud). PostHog runs only in Vercel
 * Production, so every person to delete lives here.
 */
const POSTHOG_BULK_DELETE_URL =
  'https://us.posthog.com/api/projects/551450/persons/bulk_delete/';
const POSTHOG_DELETE_TIMEOUT_MS = 10_000;

/** PostHog accepts at most 1000 distinct ids per bulk delete. */
export const POSTHOG_BULK_DELETE_LIMIT = 1000;

/**
 * Queues deletion of the PostHog persons for these Clerk user ids, with their
 * events and recordings. The distinct id is the Clerk user id, matching
 * identify(). Returns whether PostHog accepted the request; never throws.
 */
export async function deletePostHogPersons(
  authUserIds: string[],
  {
    apiKey,
    logger,
    fetchImpl = fetch,
  }: {
    apiKey: string;
    logger: Pick<Logger, 'error' | 'info'>;
    fetchImpl?: typeof fetch;
  },
): Promise<boolean> {
  try {
    const response = await fetchImpl(POSTHOG_BULK_DELETE_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        distinct_ids: authUserIds,
        delete_events: true,
        delete_recordings: true,
      }),
      signal: AbortSignal.timeout(POSTHOG_DELETE_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.error(
        { authUserIds, status: response.status },
        'PostHog person deletion failed',
      );
      return false;
    }
    logger.info({ authUserIds }, 'PostHog person deletion queued');
    return true;
  } catch (error) {
    logger.error({ authUserIds, error }, 'PostHog person deletion failed');
    return false;
  }
}
