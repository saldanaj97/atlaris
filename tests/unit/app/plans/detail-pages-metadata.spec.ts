import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(app)/plans/[id]/components/Error', () => ({
  PlanDetailPageError: () => null,
}));

vi.mock('@/app/(app)/plans/[id]/components/PlanDetailContent', () => ({
  PlanDetailContent: () => null,
  PlanDetailContentSkeleton: () => null,
}));

vi.mock('@/app/(app)/plans/[id]/modules/[moduleId]/components/Error', () => ({
  ModuleDetailPageError: () => null,
}));

vi.mock(
  '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleDetailContent',
  () => ({
    ModuleDetailContent: () => null,
    ModuleDetailContentSkeleton: () => null,
  }),
);

import { metadata as moduleMetadata } from '@/app/(app)/plans/[id]/modules/[moduleId]/page';
import { metadata as planMetadata } from '@/app/(app)/plans/[id]/page';

describe('plan detail metadata', () => {
  it('exports the static plan and module metadata contracts', () => {
    expect(planMetadata).toMatchObject({
      title: 'Atlaris — Turn learning goals into a scheduled plan',
      description:
        'Generate a time-blocked study plan from any goal with modules, resources, and progress tracking.',
      openGraph: {
        title: 'Atlaris — Turn learning goals into a scheduled plan',
        description:
          'Generate a time-blocked study plan from any goal with modules, resources, and progress tracking.',
        type: 'website',
      },
    });
    expect(moduleMetadata).toMatchObject({
      title: 'Module Details | Atlaris',
      description:
        'View module details, tasks, and resources for this learning plan module.',
    });
  });
});
