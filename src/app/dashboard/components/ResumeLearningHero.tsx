import { Play } from 'lucide-react';
import Link from 'next/link';

import type { PlanSummary } from '@/lib/types/db';

interface ResumeLearningHeroProps {
  plan: PlanSummary;
}

function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 60) {
    return `${Math.max(1, Math.round(totalMinutes))}min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  const hourLabel = `${hours}hr${hours !== 1 ? 's' : ''}`;
  return minutes > 0 ? `${hourLabel} ${minutes}min` : hourLabel;
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * ResumeLearningHero component displays a hero card for the user's most recent learning plan.
 *
 * This component shows plan progress, key metrics (skill level, weekly hours, duration, module count),
 * and provides a call-to-action to continue learning. It renders a circular progress indicator and
 * displays the next module to be completed.
 *
 * @param props - Component props
 * @param props.plan - The PlanSummary object containing plan details and progress information
 *
 * @example
 * ```tsx
 * <ResumeLearningHero plan={planSummary} />
 * ```
 *
 * The PlanSummary type should contain:
 * - `plan.id`: Unique identifier for the learning plan
 * - `plan.topic`: The main topic/subject of the plan
 * - `plan.skillLevel`: Skill level (e.g., 'beginner', 'intermediate', 'advanced')
 * - `plan.weeklyHours`: Recommended weekly hours for the plan
 * - `completion`: Completion percentage (0-1)
 * - `modules`: Array of module objects
 * - `completedModules`: Number of completed modules
 * - `totalMinutes`: Total duration of the plan in minutes
 */
export function ResumeLearningHero({ plan }: ResumeLearningHeroProps) {
  const skillLevel = capitalizeFirst(plan.plan.skillLevel ?? 'beginner');
  const weeklyHours = plan.plan.weeklyHours ?? 10;
  const moduleCount = plan.modules.length;
  const totalDuration = formatDuration(plan.totalMinutes);
  // Clamp completion to [0, 1] to prevent display issues with invalid data
  const clampedCompletion = Math.max(0, Math.min(1, plan.completion));
  const progressPercent = Math.round(clampedCompletion * 100);

  // Find the next incomplete module (first module that isn't fully completed)
  const nextModule = plan.modules.find(
    (_, index) => index >= plan.completedModules
  );
  const nextModuleTitle = nextModule?.title ?? 'Getting Started';

  const size = 64;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progressPercent / 100);

  return (
    <div className="relative flex flex-col gap-4 overflow-hidden rounded-2xl bg-linear-to-br from-teal-500 via-emerald-500 to-cyan-500 p-6 shadow-lg">
      {/* Top row: label (left) and circular progress (right) */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs font-medium tracking-wider text-white/70 uppercase">
          Most Recent Plan
        </p>
        {/* Circular progress with number in the middle */}
        <div
          className="relative flex-shrink-0"
          style={{ width: size, height: size }}
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Plan progress: ${progressPercent}% complete`}
        >
          <svg
            className="rotate-[-90deg]"
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            aria-hidden="true"
          >
            <title>Progress indicator</title>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="white"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-300"
            />
          </svg>
          <span
            className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white"
            aria-hidden="true"
          >
            {progressPercent}%
          </span>
        </div>
      </div>

      {/* Bottom row: badges + title + description (left), Up Next + Continue (right) */}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-4">
        {/* Bottom left: badges, title, description */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            {[
              skillLevel,
              `${weeklyHours}h/week`,
              totalDuration,
              `${moduleCount} modules`,
            ].map((label) => (
              <span
                key={label}
                className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm"
              >
                {label}
              </span>
            ))}
          </div>
          <h2 className="text-2xl font-bold text-white md:text-3xl">
            {plan.plan.topic}
          </h2>
          <p className="text-sm text-white/80">
            {plan.completedModules === 0
              ? `Start your journey with ${moduleCount} modules covering ${(plan.plan.topic ?? 'your topic').toLowerCase()}.`
              : plan.completedModules === moduleCount
                ? `Congratulations! You've completed all ${moduleCount} modules.`
                : `${plan.completedModules} of ${moduleCount} modules complete. Keep going!`}
          </p>
        </div>

        {/* Bottom right: Up Next and Continue Learning */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-3 sm:gap-4">
          <p className="text-sm text-white/90">
            <span className="font-medium">Up Next:</span> {nextModuleTitle}
          </p>
          <Link
            href={`/plans/${plan.plan.id}`}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-teal-700 shadow-sm transition-colors hover:bg-white/90"
          >
            <Play className="h-4 w-4" />
            Continue Learning
          </Link>
        </div>
      </div>
    </div>
  );
}
