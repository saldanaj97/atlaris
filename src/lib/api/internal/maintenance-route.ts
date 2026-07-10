import type { PlainHandler } from '@/lib/api/auth';
import type { Logger } from '@/lib/logging/logger';

import { assertMaintenanceWorkerAccess } from '@/lib/api/internal/internal-worker-access';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { withErrorBoundary } from '@/lib/api/route-wrappers';
import { getLoggingRequestContext } from '@/lib/logging/request-context';
import * as Sentry from '@sentry/nextjs';

type MaintenanceRouteContext = {
  request: Request;
  logger: Logger;
  pathname: string;
};

type MaintenanceMonitor = {
  slug: string;
  config: Parameters<typeof Sentry.withMonitor>[2];
};

type CreateMaintenancePostRouteArgs = {
  /** Defaults to true so auth can run before async flag evaluation. */
  enabled?: () => boolean;
  unavailableMessage: string;
  unauthorizedLogMessage: string;
  monitor?: MaintenanceMonitor;
  run: (context: MaintenanceRouteContext) => Promise<Response>;
};

/**
 * Shared preamble for internal maintenance POST routes. Route bodies stay
 * local; optional Sentry monitors cover scheduled routes without forcing every
 * maintenance handler into the same monitor shape.
 */
export function createMaintenancePostRoute(
  args: CreateMaintenancePostRouteArgs,
): PlainHandler {
  return withErrorBoundary(async (request) => {
    const { logger } = getLoggingRequestContext(request);
    const pathname = new URL(request.url).pathname;

    checkIpRateLimit(request, 'internal');

    assertMaintenanceWorkerAccess({
      request,
      pathname,
      logger,
      enabled: args.enabled?.() ?? true,
      unavailableMessage: args.unavailableMessage,
      unauthorizedLogMessage: args.unauthorizedLogMessage,
    });

    const context = { request, logger, pathname };
    return args.monitor
      ? Sentry.withMonitor(
          args.monitor.slug,
          () => args.run(context),
          args.monitor.config,
        )
      : args.run(context);
  });
}
