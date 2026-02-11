'use client';

import { useCallback, useRef, useState } from 'react';

import type { StreamingEvent } from '@/lib/ai/streaming/types';
import type { CreateLearningPlanInput } from '@/lib/validation/learningPlans';

type GenerationStatus =
  | 'idle'
  | 'connecting'
  | 'generating'
  | 'persisting'
  | 'complete'
  | 'error';

type DraftModule = {
  index: number;
  title: string;
  description?: string | null;
  estimatedMinutes: number;
  tasksCount: number;
};

type GenerationError = {
  message: string;
  classification: string;
  retryable: boolean;
};

type Progress = {
  modulesParsed: number;
  modulesTotalHint?: number;
};

export type StreamingPlanState = {
  status: GenerationStatus;
  planId?: string;
  modules: DraftModule[];
  progress?: Progress;
  error?: GenerationError;
};

/**
 * Extended Error type for streaming generation failures.
 * Includes optional HTTP status, planId, and code for error recovery flows.
 */
export type StreamingError = Error & {
  status?: number;
  planId?: string;
  data?: { planId?: string };
  code?: string;
};

/** Object shape compatible with Error for type guard (message, name, stack, index sig). */
export type ErrorLike = {
  message?: string;
  name?: string;
  stack?: string;
  [key: string]: unknown;
};

export function isStreamingError(
  error: Error | ErrorLike
): error is StreamingError {
  return error instanceof Error && typeof error === 'object';
}

const INITIAL_STATE: StreamingPlanState = {
  status: 'idle',
  modules: [],
};

const parseEventLine = (line: string): StreamingEvent | null => {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const payload = trimmed.startsWith('data:')
    ? trimmed.slice('data:'.length).trim()
    : trimmed;
  if (!payload) return null;
  try {
    return JSON.parse(payload) as StreamingEvent;
  } catch {
    return null;
  }
};

export function useStreamingPlanGeneration() {
  const [state, setState] = useState<StreamingPlanState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const startGeneration = useCallback(
    async (input: CreateLearningPlanInput): Promise<string> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        status: 'connecting',
        modules: [],
        progress: undefined,
        error: undefined,
        planId: undefined,
      });

      const response = await fetch('/api/v1/plans/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const fallbackMessage = 'Unable to start streaming plan generation.';
        let message = fallbackMessage;
        let code: string | undefined;
        try {
          const json = (await response.json()) as {
            error?: string;
            code?: string;
          };
          if (json?.error) {
            message = json.error;
          }
          if (json?.code) {
            code = json.code;
          }
        } catch {
          // ignore parse errors; use fallback
        }
        const error = new Error(message) as StreamingError;
        error.status = response.status;
        if (code) {
          error.code = code;
        }
        throw error;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      return await new Promise<string>((resolve, reject) => {
        let completed = false;
        let errored = false;
        let latestPlanId: string | undefined;

        const handleEvent = (event: StreamingEvent) => {
          switch (event.type) {
            case 'plan_start':
              latestPlanId = event.data.planId;
              setState((prev) => ({
                ...prev,
                status: 'generating',
                planId: event.data.planId,
              }));
              break;
            case 'module_summary':
              latestPlanId = latestPlanId ?? event.data.planId;
              setState((prev) => ({
                ...prev,
                status: 'generating',
                planId: prev.planId ?? latestPlanId,
                modules: [
                  ...prev.modules,
                  {
                    index: event.data.index,
                    title: event.data.title,
                    description: event.data.description,
                    estimatedMinutes: event.data.estimatedMinutes,
                    tasksCount: event.data.tasksCount,
                  },
                ],
              }));
              break;
            case 'progress':
              setState((prev) => ({
                ...prev,
                progress: {
                  modulesParsed: event.data.modulesParsed,
                  modulesTotalHint: event.data.modulesTotalHint,
                },
              }));
              break;
            case 'complete':
              completed = true;
              latestPlanId = latestPlanId ?? event.data.planId;
              setState((prev) => ({
                ...prev,
                status: 'complete',
                planId: prev.planId ?? latestPlanId,
              }));
              resolve(event.data.planId);
              break;
            case 'error':
              errored = true;
              const errorPlanId = event.data.planId ?? latestPlanId;
              setState((prev) => ({
                ...prev,
                status: 'error',
                planId: prev.planId ?? event.data.planId ?? latestPlanId,
                error: {
                  message: event.data.message,
                  classification: event.data.classification,
                  retryable: event.data.retryable,
                },
              }));
              const streamErr = new Error(
                event.data.message ||
                  'Plan generation failed. Please try again.'
              ) as StreamingError;
              streamErr.planId = errorPlanId ?? undefined;
              streamErr.data = { planId: errorPlanId ?? undefined };
              reject(streamErr);
              break;
          }
        };

        const pump = async (): Promise<void> => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                setState((prev) => ({
                  ...prev,
                  status:
                    prev.status === 'complete' || prev.status === 'error'
                      ? prev.status
                      : 'persisting',
                }));
                if (!completed && !errored) {
                  reject(
                    new Error(
                      'Plan generation ended unexpectedly. Please try again.'
                    )
                  );
                }
                return;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';

              for (const line of lines) {
                const event = parseEventLine(line);
                if (event) {
                  handleEvent(event);
                }
              }
            }
          } catch (error) {
            reject(
              error instanceof Error
                ? error
                : new Error('Plan generation stream failed.')
            );
          }
        };

        void pump().then(() => {
          // Resolve/reject handled by events; no-op on normal completion.
        });
      });
    },
    []
  );

  return {
    state,
    startGeneration,
    cancel,
  };
}
