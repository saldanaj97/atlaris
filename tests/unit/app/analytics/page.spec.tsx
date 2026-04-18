import { redirect } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';

import { runAnalyticsRootRedirect } from '@/app/analytics/page';
import { ROUTES } from '@/features/navigation/routes';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('runAnalyticsRootRedirect', () => {
  it('invokes redirect with the usage analytics route', () => {
    const redirectMock = vi.mocked(redirect);

    runAnalyticsRootRedirect();

    expect(redirectMock).toHaveBeenCalledWith(ROUTES.ANALYTICS.USAGE);
  });
});
