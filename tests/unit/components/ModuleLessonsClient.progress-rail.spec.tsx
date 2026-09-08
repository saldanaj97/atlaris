import type { ModuleDetailTask } from '@/features/plans/read-projection/types';

import { lesson, renderClient } from './module-lessons-client-test-utils';
import { screen } from '@testing-library/react';
import { createId } from '@tests/fixtures/ids';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe('ModuleLessonsClient progress rail', () => {
  it('renders progress and local lesson links from live status and lock state', () => {
    const secondLesson: ModuleDetailTask = {
      ...lesson,
      id: createId('task'),
      order: 2,
      title: 'Second lesson',
      estimatedMinutes: 15,
    };

    renderClient({
      lessons: [lesson, secondLesson],
      statuses: { [lesson.id]: 'completed' },
      lessonGeneration: {
        status: 'ready',
        startedAt: null,
        completedAt: null,
        failedAt: null,
        error: null,
      },
    });

    expect(
      screen.getByRole('progressbar', { name: 'Lesson progress: 50%' }),
    ).toHaveAttribute('aria-valuenow', '50');
    expect(
      screen.getByRole('link', { name: /1\. First lesson/ }),
    ).toHaveAttribute('href', `#lesson-${lesson.id}`);
    expect(
      screen.getByRole('link', { name: /2\. Second lesson/ }),
    ).toHaveAttribute('aria-current', 'step');
  });

  it('keeps locked lessons visible in progress without making them links', () => {
    const secondLesson: ModuleDetailTask = {
      ...lesson,
      id: createId('task'),
      order: 2,
      title: 'Second lesson',
    };

    renderClient({
      lessons: [lesson, secondLesson],
      lessonGeneration: {
        status: 'ready',
        startedAt: null,
        completedAt: null,
        failedAt: null,
        error: null,
      },
    });

    expect(screen.getByText('2. Second lesson')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /2\. Second lesson/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(', locked', { selector: '.sr-only' }),
    ).toBeInTheDocument();
  });

  it('distinguishes an empty lesson collection from zero-percent progress', () => {
    renderClient({
      lessons: [],
      lessonGeneration: {
        status: 'ready',
        startedAt: null,
        completedAt: null,
        failedAt: null,
        error: null,
      },
    });

    expect(screen.getByText('No lessons available yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Lesson progress will appear when this module has lessons.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('No lessons yet')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
