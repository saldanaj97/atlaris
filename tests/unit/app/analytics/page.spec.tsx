import { runAnalyticsRootRedirect } from '@/app/(app)/analytics/page';
import { ROUTES } from '@/features/navigation/routes';
import { redirect } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';

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
