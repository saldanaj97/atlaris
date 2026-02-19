import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { ServiceUnavailableError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';

export const POST = withErrorBoundary(
  withAuthAndRateLimit('integration', async (ctx) => {
    logger.info(
      { provider: 'google_calendar', userId: ctx.userId },
      'disabled google calendar sync invoked'
    );
    throw new ServiceUnavailableError(
      'Google Calendar sync is currently disabled',
      { provider: 'google_calendar' }
    );
  })
);
