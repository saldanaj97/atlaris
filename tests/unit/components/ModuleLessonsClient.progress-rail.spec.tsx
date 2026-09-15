import type { ModuleDetailTask } from '@/features/plans/read-projection/types';

import { lesson, renderClient } from './module-lessons-client-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createId } from '@tests/fixtures/ids';
import { describe, expect, it, vi } from 'vitest';

function progressDisclosure(): HTMLDetailsElement {
  const details = document.querySelector('details');
  if (!details) {
    throw new Error('Expected a lesson-progress disclosure');
  }
  return details;
}

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

    const disclosure = within(progressDisclosure());
    expect(
      disclosure.getByRole('progressbar', { name: 'Lesson progress: 50%' }),
    ).toHaveAttribute('aria-valuenow', '50');
    expect(
      disclosure.getByRole('link', { name: /1\. First lesson/ }),
    ).toHaveAttribute('href', `#lesson-${lesson.id}`);
    expect(
      disclosure.getByRole('link', { name: /2\. Second lesson/ }),
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

    const disclosure = within(progressDisclosure());
    expect(disclosure.getByText('2. Second lesson')).toBeInTheDocument();
    expect(
      disclosure.queryByRole('link', { name: /2\. Second lesson/ }),
    ).not.toBeInTheDocument();
    expect(
      disclosure.getByText(', locked', { selector: '.sr-only' }),
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

    const disclosure = within(progressDisclosure());
    expect(
      disclosure.getByText('No lessons available yet'),
    ).toBeInTheDocument();
    expect(
      disclosure.getByText(
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

    const disclosure = progressDisclosure();
    const lessonsHeading = screen.getByRole('heading', { name: 'Lessons' });

    expect(disclosure.querySelector('summary')).toHaveTextContent(
      'Lesson progress',
    );
    expect(
      disclosure.compareDocumentPosition(lessonsHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps the wide lesson-progress rail outside the mobile disclosure', async () => {
    const user = userEvent.setup();
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

    const disclosure = progressDisclosure();
    const asides = document.querySelectorAll('aside');
    expect(asides).toHaveLength(2);
    expect(disclosure.contains(asides[0])).toBe(true);
    expect(disclosure.contains(asides[1])).toBe(false);

    await user.click(disclosure.querySelector('summary')!);

    expect(disclosure).not.toHaveAttribute('open');
    expect(document.querySelectorAll('aside')).toHaveLength(2);
    expect(asides[1]?.querySelector('nav')).not.toBeNull();
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

    await user.click(
      within(progressDisclosure()).getByRole('link', {
        name: /1\. First lesson/,
      }),
    );

    expect(firstTrigger).toHaveAttribute('data-state', 'open');
    expect(secondTrigger).toHaveAttribute('data-state', 'closed');
  });
});
