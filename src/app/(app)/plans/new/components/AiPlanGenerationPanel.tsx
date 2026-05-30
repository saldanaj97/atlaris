'use client';

import type React from 'react';

import { UnifiedPlanInput } from '@/app/(app)/plans/new/components/plan-form/UnifiedPlanInput';
import { useStartAiPlanGeneration } from '@/app/(app)/plans/new/hooks/useStartAiPlanGeneration';

/**
 * AiPlanGenerationPanel collects the learning goal form, streams AI plan
 * generation progress, and routes to the created plan on success.
 */
export function AiPlanGenerationPanel(): React.ReactElement {
  const { isSubmitting, submit } = useStartAiPlanGeneration();

  return <UnifiedPlanInput onSubmit={submit} isSubmitting={isSubmitting} />;
}
