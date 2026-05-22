import { PlanTimeline } from '@/app/(app)/plans/[id]/components/PlanTimeline';
import type { ClientModule } from '@/shared/types/client.types';
import { createId } from '@tests/fixtures/ids';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

function createModule(
  order: number,
  title: string,
  tasks: ClientModule['tasks'],
  id = createId('module'),
): ClientModule {
  return {
    id,
    order,
    title,
    description: null,
    estimatedMinutes: tasks.reduce(
      (total, task) => total + task.estimatedMinutes,
      0,
    ),
    tasks,
  };
}

function createTask(
  order: number,
  title: string,
  status: 'completed' | 'not_started' = 'not_started',
  id = createId('task'),
) {
  return {
    id,
    order,
    title,
    description: null,
    estimatedMinutes: 30,
    status,
    resources: [],
  };
}

describe('PlanTimeline', () => {
  it('renders an empty-state message when there are no modules', () => {
    render(
      <PlanTimeline
        planId={createId('plan')}
        modules={[]}
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByText('No modules available yet.')).toBeInTheDocument();
  });

  it('expands the active module by default and links to the module page', () => {
    const planId = createId('plan');
    const moduleOneId = createId('module');
    const modules = [
      createModule(1, 'Foundations', [createTask(1, 'Intro')], moduleOneId),
      createModule(2, 'Advanced', [createTask(1, 'Deep dive')]),
    ];

    render(
      <PlanTimeline
        planId={planId}
        modules={modules}
        onStatusChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('link', { name: /view full module/i }),
    ).toHaveAttribute('href', `/plans/${planId}/modules/${moduleOneId}`);
    expect(
      screen.getByRole('button', { name: /mark task as complete/i }),
    ).toBeInTheDocument();
  });

  it('disables locked module toggles', () => {
    const modules = [
      createModule(1, 'Foundations', [createTask(1, 'Intro')]),
      createModule(2, 'Advanced', [createTask(1, 'Deep dive')]),
    ];

    render(
      <PlanTimeline
        planId={createId('plan')}
        modules={modules}
        onStatusChange={vi.fn()}
      />,
    );

    const lockedToggle = screen.getByRole('button', {
      name: /week 2/i,
    });
    expect(lockedToggle).toBeDisabled();
  });

  it('calls onStatusChange when completing the last incomplete task in a module', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    const taskOneId = createId('task');
    const modules = [
      createModule(1, 'Foundations', [
        createTask(1, 'Intro', 'not_started', taskOneId),
      ]),
      createModule(2, 'Advanced', [createTask(1, 'Deep dive')]),
    ];

    render(
      <PlanTimeline
        planId={createId('plan')}
        modules={modules}
        onStatusChange={onStatusChange}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: /mark task as complete/i }),
    );

    expect(onStatusChange).toHaveBeenCalledWith(taskOneId, 'completed');
  });
});
