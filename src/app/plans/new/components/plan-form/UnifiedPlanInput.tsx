'use client';

import { Button } from '@/components/ui/button';
import { ArrowRight, Calendar, Clock, Loader2, Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { InlineDropdown } from './InlineDropdown';
import {
  DEADLINE_OPTIONS,
  LEARNING_STYLE_OPTIONS,
  type PlanFormData,
  SKILL_LEVEL_OPTIONS,
  WEEKLY_HOURS_OPTIONS,
} from './types';

interface UnifiedPlanInputProps {
  onSubmit: (data: PlanFormData) => void;
  isSubmitting?: boolean;
  disabled?: boolean;
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
}: UnifiedPlanInputProps) {
  const baseId = useId();
  const [topic, setTopic] = useState('');
  const [skillLevel, setSkillLevel] = useState('beginner');
  const [weeklyHours, setWeeklyHours] = useState('3-5');
  const [learningStyle, setLearningStyle] = useState('mixed');
  const [deadlineWeeks, setDeadlineWeeks] = useState('4');

  const topicInputId = `${baseId}-topic`;

  const handleSubmit = () => {
    if (!topic.trim() || isSubmitting || disabled) return;
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

  return (
    <div className="w-full max-w-2xl">
      {/* Main input card with glassmorphism */}
      <div className="relative rounded-3xl border border-white/50 bg-white/60 px-6 py-5 shadow-2xl backdrop-blur-xl transition-all focus-within:shadow-purple-500/20">
        {/* Decorative gradient glow - clipped to card bounds */}
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
          aria-hidden="true"
        >
          <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br from-purple-300 to-pink-200 opacity-40 blur-2xl" />
        </div>

        {/* Topic input */}
        <div className="relative mb-4">
          <label htmlFor={topicInputId} className="sr-only">
            What do you want to learn?
          </label>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <textarea
              id={topicInputId}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="I want to learn TypeScript for React development..."
              className="min-h-[72px] w-full resize-none bg-transparent text-lg text-gray-900 placeholder-gray-400 focus:outline-none"
              rows={2}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Inline sentence with dropdowns - Row 1 */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-gray-700">
          <span className="text-sm">I&apos;m a</span>
          <InlineDropdown
            id={`${baseId}-skill-level`}
            options={SKILL_LEVEL_OPTIONS}
            value={skillLevel}
            onChange={setSkillLevel}
            variant="purple"
          />
          <span className="text-sm">with</span>
          <InlineDropdown
            id={`${baseId}-weekly-hours`}
            options={WEEKLY_HOURS_OPTIONS}
            value={weeklyHours}
            onChange={setWeeklyHours}
            icon={<Clock className="h-3.5 w-3.5" />}
            variant="cyan"
          />
          <span className="text-sm">per week.</span>
        </div>

        {/* Inline sentence with dropdowns - Row 2 */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-gray-700">
          <span className="text-sm">I prefer</span>
          <InlineDropdown
            id={`${baseId}-learning-style`}
            options={LEARNING_STYLE_OPTIONS}
            value={learningStyle}
            onChange={setLearningStyle}
            variant="pink"
          />
          <span className="text-sm">and want to finish in</span>
          <InlineDropdown
            id={`${baseId}-deadline`}
            options={DEADLINE_OPTIONS}
            value={deadlineWeeks}
            onChange={setDeadlineWeeks}
            icon={<Calendar className="h-3.5 w-3.5" />}
            variant="rose"
          />
        </div>

        {/* Submit button */}
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isDisabled}
            className="group h-auto rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 px-6 py-3 text-white shadow-xl shadow-purple-500/25 transition hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-purple-500/30 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-xl"
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
      <p className="mt-4 text-center text-sm text-gray-500">
        Takes about 60 seconds. Press{' '}
        <kbd
          className="rounded bg-gray-200/60 px-1.5 py-0.5 text-xs font-medium"
          suppressHydrationWarning
        >
          {typeof navigator !== 'undefined' &&
          /Mac|iPod|iPhone|iPad/.test(navigator.platform)
            ? '⌘'
            : 'Ctrl'}
          +Enter
        </kbd>{' '}
        to submit.
      </p>
    </div>
  );
}
