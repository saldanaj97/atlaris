'use client';

import type { PlanFormData } from './types';

import {
  createInitialPlanInputState,
  planInputReducer,
} from './plan-input-state';
import { PreferenceControls } from './PreferenceControls';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { Textarea } from '@/components/ui/textarea';
import { isDevelopment } from '@/lib/config/client-env';
import { clientLogger } from '@/lib/logging/client';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useEffect, useId, useReducer, useRef } from 'react';

interface UnifiedPlanInputProps {
  onSubmit: (data: PlanFormData) => void;
  isSubmitting?: boolean;
  disabled?: boolean;
  initialTopic?: string;
  topicResetVersion?: number;
}

/**
 * Unified input for plan generation: goal textarea + preference controls.
 *
 * Frame uses product `Surface` panel; no glassmorphism / mouse glow / gradient orbs.
 */
export function UnifiedPlanInput({
  onSubmit,
  isSubmitting = false,
  disabled = false,
  initialTopic = '',
  topicResetVersion = 0,
}: UnifiedPlanInputProps) {
  const baseId = useId();
  const [state, dispatch] = useReducer(
    planInputReducer,
    initialTopic,
    createInitialPlanInputState,
  );

  const prevResetVersionRef = useRef(topicResetVersion);
  // Ref so the reset effect can read the current topic without it being a dep.
  const topicRef = useRef(state.topic);

  useEffect(() => {
    topicRef.current = state.topic;
  }, [state.topic]);

  useEffect(() => {
    if (prevResetVersionRef.current === topicResetVersion) {
      return;
    }

    prevResetVersionRef.current = topicResetVersion;

    if (topicRef.current === initialTopic) {
      return;
    }

    dispatch({
      type: 'reset-topic',
      value: initialTopic,
    });
  }, [initialTopic, topicResetVersion]);

  const topic = state.topic;

  const topicInputId = `${baseId}-topic`;

  const hasSelectedPreferences =
    state.skillLevel !== null &&
    state.weeklyHours !== null &&
    state.learningStyle !== null &&
    state.deadlineWeeks !== null;
  const isFormValid = topic.trim().length > 0 && hasSelectedPreferences;
  const isDisabled = isSubmitting || disabled || !isFormValid;

  const handleSubmit = () => {
    if (!isFormValid || isSubmitting || disabled) {
      if (isDevelopment && !topic.trim()) {
        clientLogger.warn(
          '[UnifiedPlanInput] Empty topic submission prevented',
        );
      }
      return;
    }

    const { skillLevel, weeklyHours, learningStyle, deadlineWeeks } = state;

    if (!skillLevel || !weeklyHours || !learningStyle || !deadlineWeeks) {
      return;
    }

    onSubmit({
      topic: topic.trim(),
      skillLevel,
      weeklyHours,
      learningStyle,
      deadlineWeeks,
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Cmd/Ctrl + Enter
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className='w-full max-w-5xl'>
      <Surface
        padding='none'
        className='overflow-hidden px-5 py-5 shadow-sm transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40 sm:px-6 sm:py-6 lg:px-8 lg:py-7'
      >
        <div className='pb-6'>
          <label htmlFor={topicInputId} className='sr-only'>
            What do you want to learn?
          </label>
          <Textarea
            id={topicInputId}
            value={topic}
            onChange={(e) =>
              dispatch({ type: 'set-topic', value: e.target.value })
            }
            onKeyDown={handleKeyDown}
            placeholder='e.g. TypeScript for React apps, conversational Spanish, product design fundamentals…'
            className='min-h-36 w-full min-w-0 resize-none rounded-md border-0 text-base leading-7 text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0 sm:text-lg md:min-h-40'
            rows={5}
            disabled={isSubmitting || disabled}
          />
        </div>

        <div className='flex flex-row flex-wrap items-end justify-between gap-6'>
          <PreferenceControls
            baseId={baseId}
            state={state}
            dispatch={dispatch}
          />
          <Button
            type='button'
            variant='cta'
            size='lg'
            className='ml-auto shrink-0'
            onClick={handleSubmit}
            disabled={isDisabled}
          >
            {isSubmitting ? (
              <>
                <Loader2 className='mr-2 size-4 animate-spin motion-reduce:animate-none' />
                <span>Generating…</span>
              </>
            ) : (
              <>
                <span>Chart this course</span>
                <ArrowRight className='ml-2 size-4 transition-transform group-hover:translate-x-1' />
              </>
            )}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
