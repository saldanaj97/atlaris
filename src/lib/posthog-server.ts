import { isPostHogEnabledInCurrentEnvironment } from '@/lib/config/env/posthog';
import { resolvePostHogRewriteDestinations } from '@/lib/posthog-rewrite-destinations';
import { after } from 'next/server';
import { PostHog } from 'posthog-node';

let posthogClient: PostHog | null = null;

function resolvePostHogNodeSdkHost(rawHost: string | undefined): string {
  try {
    return resolvePostHogRewriteDestinations(rawHost).ingestOrigin;
  } catch {
    return resolvePostHogRewriteDestinations(null).ingestOrigin;
  }
}

export function getPostHogClient(): PostHog | null {
  if (!isPostHogEnabledInCurrentEnvironment()) {
    return null;
  }

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN or NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once both variables are configured',
      );
    }
    return null;
  }

  const host = resolvePostHogNodeSdkHost(process.env.NEXT_PUBLIC_POSTHOG_HOST);

  if (!posthogClient) {
    posthogClient = new PostHog(token, {
      host,
      flushAt: 1,
      flushInterval: 0,
    });
  }

  return posthogClient;
}

export function captureAfterResponse(
  actor: { authUserId: string },
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!isPostHogEnabledInCurrentEnvironment()) {
    return;
  }

  const distinctId = actor.authUserId;
  const send = async () => {
    const posthog = getPostHogClient();
    if (!posthog) return;
    posthog.capture({ distinctId, event, properties });
    await posthog.flush();
  };

  try {
    after(send);
  } catch {}
}
