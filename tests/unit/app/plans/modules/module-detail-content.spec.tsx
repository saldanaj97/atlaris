import { ModuleDetailContent } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleDetailContent';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const NOT_FOUND_SENTINEL = 'NEXT_HTTP_ERROR_FALLBACK;404';

const { loadModuleForPageMock, notFoundMock, redirectMock } = vi.hoisted(
  () => ({
    loadModuleForPageMock: vi.fn(),
    notFoundMock: vi.fn(),
    redirectMock: vi.fn(),
  }),
);

vi.mock('@/app/(app)/plans/[id]/modules/[moduleId]/module-page-data', () => ({
  loadModuleForPage: loadModuleForPageMock,
}));

vi.mock('@/lib/logging/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

function accessError(code: string, message: string) {
  return { success: false, error: { code, message } };
}

describe('ModuleDetailContent access results', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    notFoundMock.mockImplementation(() => {
      throw new Error(NOT_FOUND_SENTINEL);
    });
  });

  it('calls notFound() for a missing or not-owned module', async () => {
    loadModuleForPageMock.mockResolvedValueOnce(
      accessError('NOT_FOUND', 'This module does not exist.'),
    );

    await expect(
      ModuleDetailContent({ planId: 'plan-1', moduleId: 'module-1' }),
    ).rejects.toThrow(NOT_FOUND_SENTINEL);

    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it('keeps internal failures as an error state', async () => {
    loadModuleForPageMock.mockResolvedValueOnce(
      accessError('INTERNAL_ERROR', 'boom'),
    );

    render(
      await ModuleDetailContent({ planId: 'plan-1', moduleId: 'module-1' }),
    );

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Error loading module');
  });
});
