'use client';

import { useCallback } from 'react';

import {
  type PlanGenerationResult,
  type PlanGenerationSessionState,
  usePlanGenerationSession,
} from '@/features/plans/session/usePlanGenerationSession';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';

type GenerationStatus = PlanGenerationSessionState['status'];

type DraftModule = PlanGenerationSessionState['modules'][number];

type GenerationError = {
  message: string;
  classification: string;
  retryable: boolean;
};

type Progress = PlanGenerationSessionState['progress'];

export type StreamingPlanState = {
  status: GenerationStatus;
  planId?: string;
  modules: DraftModule[];
  progress?: Progress;
  error?: GenerationError;
};

export type StreamingError = Error & {
  status?: number;
  planId?: string;
  data?: { planId?: string };
  code?: string;
  classification?: string;
  retryable?: boolean;
};

export type { PlanGenerationResult };

export function isStreamingError(error: unknown): error is StreamingError {
  if (error instanceof Error) {
    return true;
  }

  if (error === null || typeof error !== 'object') {
    return false;
  }

  return (
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

export type StartGenerationOptions = {
  onPlanIdReady?: (planId: string) => void;
};

type StartGeneration = (
  input: CreateLearningPlanInput,
  options?: StartGenerationOptions
) => Promise<PlanGenerationResult>;

export interface UseStreamingPlanGenerationResult {
  state: StreamingPlanState;
  startGeneration: StartGeneration;
  cancel: () => void;
}

export function useStreamingPlanGeneration(): UseStreamingPlanGenerationResult {
  const { state, startSession, cancel } = usePlanGenerationSession();

  const startGeneration = useCallback<StartGeneration>(
    (input, options) => startSession({ kind: 'create', input }, options),
    [startSession]
  );

  return {
    state,
    startGeneration,
    cancel,
  };
}
