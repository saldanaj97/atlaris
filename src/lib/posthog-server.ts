import { after } from 'next/server';
import { PostHog } from 'posthog-node';

let posthogClient: PostHog | null = null;

/**
 * Returns a singleton PostHog server-side client.
 *
 * Uses flushAt=1 and flushInterval=0 so events send promptly. Route handlers
 * are still short-lived — call `captureAfterResponse` so capture+flush run
 * in `after()` and do not block the mutation response.
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
      // Flush immediately — after() still needs flush() before the runtime tears down.
      flushAt: 1,
      flushInterval: 0,
    });
  }

  return posthogClient;
}

/**
 * Capture a server event after the HTTP response is sent.
 *
 * `distinctId` is always Clerk `authUserId` so it matches
 * `posthog.identify(user.id)` in PostHogUserIdentifier.
 */
export function captureAfterResponse(
  actor: { authUserId: string },
  event: string,
  properties?: Record<string, unknown>,
): void {
  const distinctId = actor.authUserId;
  after(async () => {
    const posthog = getPostHogClient();
    if (!posthog) return;
    posthog.capture({ distinctId, event, properties });
    await posthog.flush();
  });
}
