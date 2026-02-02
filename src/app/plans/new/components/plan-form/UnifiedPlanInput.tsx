'use client';

import { Button } from '@/components/ui/button';
import { clientLogger } from '@/lib/logging/client';
import { ArrowRight, Calendar, Clock, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { InlineDropdown } from './InlineDropdown';
import {
  DEADLINE_OPTIONS,
  LEARNING_STYLE_OPTIONS,
  SKILL_LEVEL_OPTIONS,
  WEEKLY_HOURS_OPTIONS,
} from './constants';

import type { PlanFormData } from './types';

interface UnifiedPlanInputProps {
  onSubmit: (data: PlanFormData) => void;
  isSubmitting?: boolean;
  disabled?: boolean;
  initialTopic?: string;
}

/**
 * Modern unified input component for plan generation.
 * Features a text input with inline dropdown selectors that appear
 * as styled pills within a natural language sentence structure.
 *
 * Design: Glassmorphism matching the landing page aesthetic.
 */
export function UnifiedPlanInput({
  onSubmit,
  isSubmitting = false,
  disabled = false,
  initialTopic = '',
}: UnifiedPlanInputProps) {
  const baseId = useId();
  const [topic, setTopic] = useState(initialTopic);
  const [skillLevel, setSkillLevel] = useState('beginner');
  const [weeklyHours, setWeeklyHours] = useState('3-5');
  const [learningStyle, setLearningStyle] = useState('mixed');
  const [deadlineWeeks, setDeadlineWeeks] = useState('4');
  const topicTouchedRef = useRef(false);

  useEffect(() => {
    if (
      initialTopic !== undefined &&
      initialTopic !== '' &&
      !topicTouchedRef.current
    ) {
      setTopic(initialTopic);
    }
  }, [initialTopic]);

  const handleTopicChange = (value: string) => {
    topicTouchedRef.current = true;
    setTopic(value);
  };

  const topicInputId = `${baseId}-topic`;

  const handleSubmit = () => {
    if (!topic.trim() || isSubmitting || disabled) {
      if (process.env.NODE_ENV === 'development' && !topic.trim()) {
        clientLogger.warn(
          '[UnifiedPlanInput] Empty topic submission prevented'
        );
      }
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

  const isFormValid = topic.trim().length > 0;
  const isDisabled = isSubmitting || disabled || !isFormValid;

  // Memoize platform detection to avoid re-running on every render
  const isMac = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return (
      (navigator as Navigator & { userAgentData?: { platform?: string } })
        .userAgentData?.platform === 'macOS' ||
      /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
    );
  }, []);

  return (
    <div className="w-full max-w-2xl">
      {/* Main input card with glassmorphism */}
      <div className="dark:border-border dark:bg-card/60 dark:focus-within:shadow-primary/10 focus-within:shadow-primary/20 border-border bg-card/60 relative rounded-3xl border px-6 py-5 shadow-2xl backdrop-blur-xl transition-all">
        {/* Decorative gradient glow - clipped to card bounds */}
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
          aria-hidden="true"
        >
          <div className="dark:from-primary/40 dark:to-accent/30 from-primary/30 to-accent/20 absolute -top-12 -right-12 h-32 w-32 rounded-full bg-linear-to-br opacity-40 blur-2xl dark:opacity-20" />
        </div>

        {/* Topic input */}
        <div className="relative mb-4">
          <label htmlFor={topicInputId} className="sr-only">
            What do you want to learn?
          </label>
          <div className="flex items-start gap-3">
            <div className="from-primary to-accent flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-linear-to-br shadow-lg">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <textarea
              id={topicInputId}
              value={topic}
              onChange={(e) => handleTopicChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="I want to learn TypeScript for React development..."
              className="dark:text-foreground dark:placeholder-muted-foreground text-foreground placeholder-muted-foreground min-h-[72px] w-full resize-none bg-transparent text-lg focus:outline-none"
              rows={2}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Inline sentence with dropdowns - Row 1 */}
        <div className="dark:text-foreground text-foreground mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm">I&apos;m a</span>
          <InlineDropdown
            id={`${baseId}-skill-level`}
            options={SKILL_LEVEL_OPTIONS}
            value={skillLevel}
            onChange={setSkillLevel}
            variant="primary"
          />
          <span className="text-sm">with</span>
          <InlineDropdown
            id={`${baseId}-weekly-hours`}
            options={WEEKLY_HOURS_OPTIONS}
            value={weeklyHours}
            onChange={setWeeklyHours}
            icon={<Clock className="h-3.5 w-3.5" />}
            variant="accent"
          />
          <span className="text-sm">per week.</span>
        </div>

        {/* Inline sentence with dropdowns - Row 2 */}
        <div className="dark:text-foreground text-foreground mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm">I prefer</span>
          <InlineDropdown
            id={`${baseId}-learning-style`}
            options={LEARNING_STYLE_OPTIONS}
            value={learningStyle}
            onChange={setLearningStyle}
            variant="accent"
          />
          <span className="text-sm">and want to finish in</span>
          <InlineDropdown
            id={`${baseId}-deadline`}
            options={DEADLINE_OPTIONS}
            value={deadlineWeeks}
            onChange={setDeadlineWeeks}
            icon={<Calendar className="h-3.5 w-3.5" />}
            variant="primary"
          />
        </div>

        {/* Submit button */}
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isDisabled}
            className="group from-primary via-accent to-primary shadow-primary/25 hover:shadow-primary/30 h-auto rounded-2xl bg-gradient-to-r px-6 py-3 text-white shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-xl"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span className="font-medium">Generating...</span>
              </>
            ) : (
              <>
                <span className="font-medium">Generate My Plan</span>
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Subtext with keyboard hint */}
      <p className="dark:text-muted-foreground text-muted-foreground mt-4 text-center text-sm">
        Takes about 60 seconds. Press{' '}
        <kbd
          className="dark:bg-muted bg-muted/60 rounded px-1.5 py-0.5 text-xs font-medium"
          suppressHydrationWarning
        >
          {isMac ? '⌘' : 'Ctrl'}+Enter
        </kbd>{' '}
        to submit.
      </p>
    </div>
  );
}
