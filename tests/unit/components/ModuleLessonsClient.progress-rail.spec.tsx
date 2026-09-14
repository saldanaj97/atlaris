import type { ModuleDetailTask } from '@/features/plans/read-projection/types';

import { lesson, renderClient } from './module-lessons-client-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('places a lesson-progress disclosure before the reading column', () => {
    renderClient({
      lessons: [lesson],
      lessonGeneration: {
        status: 'ready',
        startedAt: null,
        completedAt: null,
        failedAt: null,
        error: null,
      },
    });

    const disclosure = document.querySelector('details');
    const lessonsHeading = screen.getByRole('heading', { name: 'Lessons' });

    expect(disclosure).not.toBeNull();
    expect(disclosure?.querySelector('summary')).toHaveTextContent(
      'Lesson progress',
    );
    expect(
      disclosure!.compareDocumentPosition(lessonsHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('opens the selected lesson when a progress link is activated', async () => {
    const user = userEvent.setup();
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

    const firstTrigger = screen.getByRole('button', { name: /First lesson/ });
    const secondTrigger = screen.getByRole('button', { name: /Second lesson/ });

    expect(firstTrigger).toHaveAttribute('data-state', 'closed');
    expect(secondTrigger).toHaveAttribute('data-state', 'open');

    await user.click(screen.getByRole('link', { name: /1\. First lesson/ }));

    expect(firstTrigger).toHaveAttribute('data-state', 'open');
    expect(secondTrigger).toHaveAttribute('data-state', 'closed');
  });
});
