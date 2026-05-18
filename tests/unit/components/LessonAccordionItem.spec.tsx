import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LessonAccordionItem } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/LessonAccordionItem';
import { Accordion } from '@/components/ui/accordion';
import type { ModuleDetailTask } from '@/features/plans/read-projection/types';
import { createId } from '@tests/fixtures/ids';

const baseLesson: ModuleDetailTask = {
  id: createId('task'),
  order: 1,
  title: 'Understand state',
  description: 'Learn how state changes UI.',
  estimatedMinutes: 20,
  status: 'not_started',
  lessonContent: null,
  lessonContentUpdatedAt: null,
  resources: [
    {
      id: createId('task-resource'),
      order: 1,
      notes: 'Read first',
      type: 'article',
      title: 'State guide',
      url: 'https://example.com/state',
      durationMinutes: 5,
    },
  ],
};

function renderLesson(lesson: ModuleDetailTask, isLocked = false) {
  return render(
    <Accordion type="single" defaultValue={lesson.id}>
      <LessonAccordionItem
        lesson={lesson}
        status={lesson.status}
        onStatusChange={vi.fn()}
        isLocked={isLocked}
      />
    </Accordion>,
  );
}

describe('LessonAccordionItem', () => {
  it('renders generated lesson content blocks instead of placeholder prose', () => {
    renderLesson({
      ...baseLesson,
      lessonContent: {
        version: 1,
        blocks: [
          { type: 'heading', text: 'State basics' },
          {
            type: 'paragraph',
            text: 'State stores values that affect render.',
          },
          {
            type: 'example',
            title: 'Counter',
            text: 'Incrementing a value updates the displayed count.',
          },
          { type: 'practice', text: 'Build a tiny counter.' },
          { type: 'takeaways', items: ['State is reactive'] },
          { type: 'completion_criteria', items: ['Explain state changes'] },
        ],
      },
    });

    expect(screen.getByText('State basics')).toBeInTheDocument();
    expect(
      screen.getByText('State stores values that affect render.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Counter')).toBeInTheDocument();
    expect(screen.getByText('Build a tiny counter.')).toBeInTheDocument();
    expect(screen.getByText('State is reactive')).toBeInTheDocument();
    expect(screen.getByText('Explain state changes')).toBeInTheDocument();
    expect(
      screen.queryByText(/This content is placeholder text/i),
    ).not.toBeInTheDocument();
  });

  it('keeps resources and progress controls visible for unlocked missing content', () => {
    renderLesson(baseLesson);

    expect(
      screen.getByText('Lesson content not generated yet'),
    ).toBeInTheDocument();
    expect(screen.getByText('State guide')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mark task as complete' }),
    ).toBeInTheDocument();
  });

  it('does not render lesson body controls for locked lessons', () => {
    renderLesson(baseLesson, true);

    expect(screen.getByText('Lesson Locked')).toBeInTheDocument();
    expect(screen.queryByText('State guide')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mark task as complete' }),
    ).not.toBeInTheDocument();
  });
});
