'use client';

import type { PlanFormData } from './types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { isSelectedDeadlineAllowedForTier } from './deadline-tier';
import {
  createInitialPlanInputState,
  planInputReducer,
} from './plan-input-state';
import { PreferenceControls } from './PreferenceControls';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CUSTOM_DEADLINE_VALUE } from '@/features/plans/plan-form-payload';
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
  subscriptionTier: SubscriptionTier;
}

/**
 * Unified input for plan generation: goal textarea + preference controls.
 *
 * Frame uses product `Card`; no glassmorphism / mouse glow / gradient orbs.
 */
export function UnifiedPlanInput({
  onSubmit,
  isSubmitting = false,
  disabled = false,
  initialTopic = '',
  topicResetVersion = 0,
  subscriptionTier,
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

  useEffect(() => {
    if (
      isSelectedDeadlineAllowedForTier(subscriptionTier, state.deadlineWeeks)
    ) {
      return;
    }
    dispatch({ type: 'clear-deadline' });
  }, [subscriptionTier, state.deadlineWeeks]);

  const topic = state.topic;

  const topicInputId = `${baseId}-topic`;
  const topicHelpId = `${baseId}-topic-help`;
  const requirementsId = `${baseId}-requirements`;

  const hasSelectedPreferences =
    state.skillLevel !== null &&
    state.weeklyHours !== null &&
    state.learningStyle !== null &&
    state.deadlineWeeks !== null &&
    (state.deadlineWeeks !== CUSTOM_DEADLINE_VALUE ||
      Boolean(state.deadlineDate));
  const isFormValid = topic.trim().length > 0 && hasSelectedPreferences;
  const isDisabled = isSubmitting || disabled || !isFormValid;
  const requirementsMessage = isSubmitting
    ? 'Generating your learning plan…'
    : isFormValid
      ? 'Ready to chart your course.'
      : 'Complete your goal and preferences to continue.';

  const handleSubmit = () => {
    if (!isFormValid || isSubmitting || disabled) {
      if (isDevelopment && !topic.trim()) {
        clientLogger.warn(
          '[UnifiedPlanInput] Empty topic submission prevented',
        );
      }
      return;
    }

    const {
      skillLevel,
      weeklyHours,
      learningStyle,
      deadlineWeeks,
      deadlineDate,
    } = state;

    if (!skillLevel || !weeklyHours || !learningStyle || !deadlineWeeks) {
      return;
    }

    onSubmit({
      topic: topic.trim(),
      skillLevel,
      weeklyHours,
      learningStyle,
      deadlineWeeks,
      ...(deadlineDate ? { deadlineDate } : {}),
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
    <section aria-labelledby={`${baseId}-form-heading`} className='w-full'>
      <Card className='gap-0 py-0'>
        <CardHeader className='border-b border-border px-5 py-5 sm:px-6'>
          <CardTitle as='h2' id={`${baseId}-form-heading`}>
            Your goal
          </CardTitle>
          <CardDescription>Tell us what you want to learn.</CardDescription>
        </CardHeader>

        <CardContent className='space-y-6 px-5 py-5 sm:px-6'>
          <div>
            <Label htmlFor={topicInputId} className='text-sm leading-5'>
              What do you want to learn?
            </Label>
            <p
              id={topicHelpId}
              className='mt-2 text-sm leading-5 text-muted-foreground'
            >
              Describe the outcome you want to work toward.
            </p>
            <Textarea
              id={topicInputId}
              value={topic}
              onChange={(e) =>
                dispatch({ type: 'set-topic', value: e.target.value })
              }
              onKeyDown={handleKeyDown}
              placeholder='e.g. TypeScript for React apps, conversational Spanish, product design fundamentals…'
              aria-describedby={topicHelpId}
              aria-required='true'
              className='mt-3 min-h-24 w-full min-w-0 resize-y text-base leading-6 sm:min-h-24'
              rows={4}
              disabled={isSubmitting || disabled}
            />
          </div>

          <PreferenceControls
            baseId={baseId}
            state={state}
            dispatch={dispatch}
            subscriptionTier={subscriptionTier}
          />
        </CardContent>

        <CardFooter className='flex-col items-stretch gap-4 border-t border-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
          <p
            id={requirementsId}
            className='text-sm leading-5 text-muted-foreground'
          >
            {requirementsMessage}
          </p>
          <Button
            type='button'
            variant='cta'
            size='lg'
            className='w-full shrink-0 sm:w-auto'
            onClick={handleSubmit}
            disabled={isDisabled}
            aria-busy={isSubmitting}
            aria-describedby={requirementsId}
          >
            {isSubmitting ? (
              <>
                <Loader2
                  aria-hidden='true'
                  className='size-4 animate-spin motion-reduce:animate-none'
                />
                <span>Generating…</span>
              </>
            ) : (
              <>
                <span>Chart this course</span>
                <ArrowRight
                  aria-hidden='true'
                  className='size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none'
                />
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
