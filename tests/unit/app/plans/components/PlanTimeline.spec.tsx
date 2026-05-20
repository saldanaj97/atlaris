import { PlanTimeline } from '@/app/(app)/plans/[id]/components/PlanTimeline';
import type { ClientModule } from '@/shared/types/client.types';
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
  id: string,
  title: string,
  tasks: ClientModule['tasks'],
): ClientModule {
  return {
    id,
    order: Number.parseInt(id.replace('module-', ''), 10),
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
  id: string,
  title: string,
  status: 'completed' | 'not_started' = 'not_started',
) {
  return {
    id,
    order: Number.parseInt(id.replace('task-', ''), 10),
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
      <PlanTimeline planId="plan-1" modules={[]} onStatusChange={vi.fn()} />,
    );

    expect(screen.getByText('No modules available yet.')).toBeInTheDocument();
  });

  it('expands the active module by default and links to the module page', () => {
    const modules = [
      createModule('module-1', 'Foundations', [createTask('task-1', 'Intro')]),
      createModule('module-2', 'Advanced', [createTask('task-2', 'Deep dive')]),
    ];

    render(
      <PlanTimeline
        planId="plan-123"
        modules={modules}
        onStatusChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('link', { name: /view full module/i }),
    ).toHaveAttribute('href', '/plans/plan-123/modules/module-1');
    expect(
      screen.getByRole('button', { name: /mark task as complete/i }),
    ).toBeInTheDocument();
  });

  it('disables locked module toggles', () => {
    const modules = [
      createModule('module-1', 'Foundations', [createTask('task-1', 'Intro')]),
      createModule('module-2', 'Advanced', [createTask('task-2', 'Deep dive')]),
    ];

    render(
      <PlanTimeline
        planId="plan-123"
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
    const modules = [
      createModule('module-1', 'Foundations', [createTask('task-1', 'Intro')]),
      createModule('module-2', 'Advanced', [createTask('task-2', 'Deep dive')]),
    ];

    render(
      <PlanTimeline
        planId="plan-123"
        modules={modules}
        onStatusChange={onStatusChange}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: /mark task as complete/i }),
    );

    expect(onStatusChange).toHaveBeenCalledWith('task-1', 'completed');
  });
});
