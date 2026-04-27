'use client';

import { ArrowRight, Calendar, Clock, Loader2, Sparkles } from 'lucide-react';
import type { JSX } from 'react';
import { useEffect, useId, useMemo, useReducer, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { isDevelopment } from '@/lib/config/client-env';
import { assertNever } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';
import {
	DEADLINE_OPTIONS,
	LEARNING_STYLE_OPTIONS,
	SKILL_LEVEL_OPTIONS,
	WEEKLY_HOURS_OPTIONS,
} from './constants';
import { InlineDropdown } from './InlineDropdown';

import type { PlanFormData } from './types';

interface UnifiedPlanInputProps {
	onSubmit: (data: PlanFormData) => void;
	isSubmitting?: boolean;
	disabled?: boolean;
	initialTopic?: string;
	topicResetVersion?: number;
}

interface PlanInputState {
	topic: string;
	skillLevel: SkillLevel;
	weeklyHours: WeeklyHours;
	learningStyle: LearningStyle;
	deadlineWeeks: DeadlineWeeks;
}

type SkillLevel = (typeof SKILL_LEVEL_OPTIONS)[number]['value'];
type WeeklyHours = (typeof WEEKLY_HOURS_OPTIONS)[number]['value'];
type LearningStyle = (typeof LEARNING_STYLE_OPTIONS)[number]['value'];
type DeadlineWeeks = (typeof DEADLINE_OPTIONS)[number]['value'];

type PlanInputAction =
	| { type: 'set-topic'; value: string }
	| { type: 'reset-topic'; value: string }
	| { type: 'set-skill-level'; value: SkillLevel }
	| { type: 'set-weekly-hours'; value: WeeklyHours }
	| { type: 'set-learning-style'; value: LearningStyle }
	| { type: 'set-deadline-weeks'; value: DeadlineWeeks };

function planInputReducer(
	state: PlanInputState,
	action: PlanInputAction,
): PlanInputState {
	switch (action.type) {
		case 'set-topic':
			return {
				...state,
				topic: action.value,
			};
		// Keep this action separate so external resets remain distinct from user edits in reducer traces.
		case 'reset-topic':
			return {
				...state,
				topic: action.value,
			};
		case 'set-skill-level':
			return {
				...state,
				skillLevel: action.value,
			};
		case 'set-weekly-hours':
			return {
				...state,
				weeklyHours: action.value,
			};
		case 'set-learning-style':
			return {
				...state,
				learningStyle: action.value,
			};
		case 'set-deadline-weeks':
			return {
				...state,
				deadlineWeeks: action.value,
			};
		default:
			return assertNever(action);
	}
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
	topicResetVersion = 0,
}: UnifiedPlanInputProps): JSX.Element {
	const baseId = useId();
	const [state, dispatch] = useReducer(planInputReducer, {
		topic: initialTopic,
		skillLevel: 'beginner',
		weeklyHours: '3-5',
		learningStyle: 'mixed',
		deadlineWeeks: '4',
	});

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

	const handleSubmit = () => {
		if (!topic.trim() || isSubmitting || disabled) {
			if (isDevelopment && !topic.trim()) {
				clientLogger.warn(
					'[UnifiedPlanInput] Empty topic submission prevented',
				);
			}
			return;
		}
		onSubmit({
			topic: topic.trim(),
			skillLevel: state.skillLevel,
			weeklyHours: state.weeklyHours,
			learningStyle: state.learningStyle,
			deadlineWeeks: state.deadlineWeeks,
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
			<div className="dark:border-border dark:bg-card/60 dark:focus-within:border-ring dark:focus-within:ring-offset-background border-border bg-card/60 focus-within:border-ring focus-within:ring-ring relative rounded-3xl border px-4 py-4 shadow-2xl backdrop-blur-xl transition-all focus-within:ring-2 focus-within:ring-offset-2 sm:px-6 sm:py-5">
				{/* Decorative gradient glow - clipped to card bounds */}
				<div
					className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
					aria-hidden="true"
				>
					<div className="dark:from-primary/40 dark:to-accent/30 from-primary/30 to-accent/20 absolute -top-12 -right-12 h-32 w-32 rounded-full bg-linear-to-br opacity-40 blur-2xl dark:opacity-20" />
				</div>

				{/* Topic input */}
				<div className="relative mb-3">
					<label htmlFor={topicInputId} className="sr-only">
						What do you want to learn?
					</label>
					<div className="flex items-start gap-2.5 sm:gap-3">
						<div className="from-primary to-accent flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br shadow-lg sm:h-10 sm:w-10">
							<Sparkles className="h-4 w-4 text-white sm:h-5 sm:w-5" />
						</div>
						<Textarea
							id={topicInputId}
							value={topic}
							onChange={(e) =>
								dispatch({ type: 'set-topic', value: e.target.value })
							}
							onKeyDown={handleKeyDown}
							placeholder="I want to learn TypeScript for React development..."
							className="dark:text-foreground dark:placeholder-muted-foreground text-foreground placeholder-muted-foreground min-h-[56px] w-full resize-none border-0 bg-transparent px-0 py-0 text-base shadow-none focus-visible:ring-0 sm:min-h-[72px] sm:text-lg md:text-lg"
							rows={2}
							disabled={isSubmitting || disabled}
						/>
					</div>
				</div>

				{/* Inline sentence with dropdowns - Row 1 */}
				<div className="dark:text-foreground text-foreground mb-2.5 flex flex-wrap items-center gap-2">
					<span className="text-sm">I&apos;m a</span>
					<InlineDropdown
						id={`${baseId}-skill-level`}
						ariaLabel="Skill level"
						options={SKILL_LEVEL_OPTIONS}
						value={state.skillLevel}
						onChange={(value) => dispatch({ type: 'set-skill-level', value })}
						variant="primary"
					/>
					<span className="text-sm">with</span>
					<InlineDropdown
						id={`${baseId}-weekly-hours`}
						ariaLabel="Weekly hours"
						options={WEEKLY_HOURS_OPTIONS}
						value={state.weeklyHours}
						onChange={(value) => dispatch({ type: 'set-weekly-hours', value })}
						icon={<Clock className="h-3.5 w-3.5" />}
						variant="accent"
					/>
					<span className="text-sm">per week.</span>
				</div>

				{/* Inline sentence with dropdowns - Row 2 */}
				<div className="dark:text-foreground text-foreground mb-3 flex flex-wrap items-center gap-2">
					<span className="text-sm">I prefer</span>
					<InlineDropdown
						id={`${baseId}-learning-style`}
						ariaLabel="Learning style"
						options={LEARNING_STYLE_OPTIONS}
						value={state.learningStyle}
						onChange={(value) =>
							dispatch({ type: 'set-learning-style', value })
						}
						variant="accent"
					/>
					<span className="text-sm">and want to finish in</span>
					<InlineDropdown
						id={`${baseId}-deadline`}
						ariaLabel="Deadline"
						options={DEADLINE_OPTIONS}
						value={state.deadlineWeeks}
						onChange={(value) =>
							dispatch({ type: 'set-deadline-weeks', value })
						}
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
						className="group bg-primary hover:bg-primary/90 shadow-primary/25 hover:shadow-primary/30 h-auto rounded-2xl px-5 py-2.5 text-white shadow-xl transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-2xl disabled:opacity-50 sm:px-6 sm:py-3"
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
			<p className="dark:text-muted-foreground text-muted-foreground mt-3 text-center text-xs sm:mt-4 sm:text-sm">
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
