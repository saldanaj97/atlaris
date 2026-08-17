import { PostHog } from 'posthog-node';

let posthogClient: PostHog | null = null;

/**
 * Returns a singleton PostHog server-side client.
 *
 * Uses flushAt=1 and flushInterval=0 so that events are sent immediately —
 * Next.js route handlers and server actions are short-lived and may be torn
 * down before an async batch flush can run. Always call `await posthog.flush()`
 * before returning from a handler.
 *
 * Guards against missing env vars: returns null when not configured so that
 * callers can skip capture without breaking the request.
 */
export function getPostHogClient(): PostHog | null {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!token || !host) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN or NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once both variables are configured',
      );
    }
    return null;
  }

  if (!posthogClient) {
    posthogClient = new PostHog(token, {
      host,
      // Flush immediately — route handlers / server actions are torn down per request.
      flushAt: 1,
      flushInterval: 0,
    });
  }

  return posthogClient;
}
