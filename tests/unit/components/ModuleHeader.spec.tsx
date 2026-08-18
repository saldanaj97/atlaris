import type { ModuleDetailModule } from '@/features/plans/read-projection/types';
import type React from 'react';

import { ModuleHeader } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleHeader';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createId } from '@tests/fixtures/ids';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function completedLesson(order: number): ModuleDetailModule['tasks'][number] {
  return {
    id: createId('task'),
    order,
    title: `Lesson ${order}`,
    description: null,
    estimatedMinutes: 10,
    status: 'completed',
    lessonContent: null,
    lessonContentUpdatedAt: null,
    resources: [],
  };
}

describe('ModuleHeader', () => {
  it('keeps dropdown complete from projection while the open header stays live', async () => {
    const user = userEvent.setup();
    const currentId = createId('module');
    const siblingId = createId('module');
    const module: ModuleDetailModule = {
      id: currentId,
      order: 2,
      title: 'Visual Review',
      description: null,
      estimatedMinutes: 20,
      lessonGeneration: {
        status: 'ready',
        startedAt: null,
        completedAt: null,
        failedAt: null,
        error: null,
      },
      tasks: [completedLesson(1), completedLesson(2)],
    };

    render(
      <ModuleHeader
        module={module}
        planId={createId('plan')}
        planTopic='Plan'
        totalModules={3}
        previousModuleId={siblingId}
        nextModuleId={null}
        statuses={{}}
        previousModulesComplete
        allModules={[
          {
            id: siblingId,
            order: 1,
            title: 'Interaction Capture',
            isLocked: false,
            isComplete: true,
          },
          {
            id: currentId,
            order: 2,
            title: module.title,
            isLocked: false,
            isComplete: false,
          },
        ]}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Module 2, completed' }),
    );

    expect(
      await screen.findByRole('menuitem', {
        name: 'Interaction Capture, completed',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Visual Review$/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Visual Review, completed' }),
    ).not.toBeInTheDocument();
  });
});
