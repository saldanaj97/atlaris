import type { Logger } from '@/lib/logging/logger';

const POSTHOG_BULK_DELETE_URL =
  'https://us.posthog.com/api/projects/551450/persons/bulk_delete/';
const POSTHOG_DELETE_TIMEOUT_MS = 10_000;

export const POSTHOG_BULK_DELETE_LIMIT = 1000;

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
