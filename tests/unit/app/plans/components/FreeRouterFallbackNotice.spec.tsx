import { FreeRouterFallbackNotice } from '@/app/(app)/plans/[id]/components/FreeRouterFallbackNotice';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('FreeRouterFallbackNotice', () => {
  it.each([
    [{ outline: true, lessonModuleCount: 0 }, 'This plan was generated'],
    [{ outline: false, lessonModuleCount: 1 }, 'Lessons in 1 module were'],
    [
      { outline: true, lessonModuleCount: 3 },
      'This plan and lessons in 3 modules were',
    ],
  ])('names the affected content in a status region', (notice, subject) => {
    render(<FreeRouterFallbackNotice notice={notice} />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Generated with a free backup model');
    expect(status).toHaveTextContent(subject);
    expect(status).toHaveTextContent('because your paid model was unavailable');
    expect(status).not.toHaveTextContent('regenerate');
  });

  it('mentions regeneration only when the page offers it', () => {
    const notice = { outline: true, lessonModuleCount: 0 };
    const { rerender } = render(
      <FreeRouterFallbackNotice
        notice={notice}
        regeneration={{ canRegenerate: true, isRegenerating: false }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'You can regenerate the plan to try your paid model again.',
    );

    rerender(
      <FreeRouterFallbackNotice
        notice={notice}
        regeneration={{ canRegenerate: true, isRegenerating: true }}
      />,
    );
    expect(screen.getByRole('status')).not.toHaveTextContent('regenerate');
  });
});
