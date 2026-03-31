import type { redirect } from 'next/navigation';
import { describe, it, vi } from 'vitest';

import { runAnalyticsRootRedirect } from '@/app/analytics/page';

describe('runAnalyticsRootRedirect', () => {
  it('invokes redirect with the usage analytics route', () => {
    const redirectMock = vi.fn<(url: string) => void>();

    runAnalyticsRootRedirect(redirectMock as unknown as typeof redirect);
  });
});
