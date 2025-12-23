import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { ArrowRight, Check } from 'lucide-react';

interface HeroSectionProps {
  onCtaClick?: () => void;
}

/**
 * Hero section with headline, subheadline, CTA, and hero visual mockup.
 */
export function HeroSection({ onCtaClick }: HeroSectionProps) {
  return (
    <section
      className="relative px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-24 lg:px-8"
      aria-labelledby="hero-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Text Content */}
          <div className="max-w-xl">
            <h1
              id="hero-heading"
              className="text-4xl leading-tight font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-[3.25rem]"
            >
              Your learning plan isn&apos;t the problem.{' '}
              <span className="text-slate-600">Your calendar is.</span>
            </h1>

            <p className="mt-6 text-lg leading-relaxed text-slate-600 sm:text-xl">
              Pathfinder turns what you want to learn into a time-blocked,
              resource-linked schedule that syncs directly to Google Calendar,
              Notion, or Outlook.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button
                asChild
                className="group inline-flex items-center justify-center gap-2 bg-slate-700 px-6 py-3 text-base font-medium text-white shadow-md transition-all hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2"
                onClick={onCtaClick}
              >
                <Link href="/plans/new">
                  Build My Schedule
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </Button>
            </div>

            <p className="mt-4 text-sm text-slate-500">
              Free. Takes about 60 seconds. No credit card.
            </p>
          </div>

          {/* Hero Visual: Mockup Card */}
          <div className="relative" aria-hidden="true">
            <HeroVisual />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Hero visual showing the 3-part split UI mockup */
function HeroVisual() {
  return (
    <div className="relative">
      {/* Main card container */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
        {/* Card header */}
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-slate-300" />
            <div className="h-3 w-3 rounded-full bg-slate-300" />
            <div className="h-3 w-3 rounded-full bg-slate-300" />
            <span className="ml-3 text-xs font-medium text-slate-500">
              Pathfinder
            </span>
          </div>
        </div>

        {/* 3-part split */}
        <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {/* Left: Input Panel */}
          <div className="p-4">
            <p className="mb-3 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              Your Input
            </p>
            <div className="space-y-3">
              <InputField label="Goal" value="Learn TypeScript" />
              <InputField label="Experience" value="Intermediate JS" />
              <InputField label="Availability" value="5 hrs/week" />
              <InputField label="Timeline" value="8 weeks" />
            </div>
          </div>

          {/* Center: Progress Indicator */}
          <div className="flex flex-col items-center justify-center p-4">
            <p className="mb-4 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              Processing
            </p>
            <div className="space-y-3">
              <ProgressStep label="Structuring" completed />
              <ProgressStep label="Selecting resources" completed />
              <ProgressStep label="Scheduling" active />
            </div>
          </div>

          {/* Right: Calendar Week View */}
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Your Schedule
              </p>
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <Check className="h-3 w-3" />
                Synced
              </span>
            </div>
            <CalendarMockup />
            <p className="mt-3 text-center text-xs text-slate-400">
              Created 12 seconds ago
            </p>
          </div>
        </div>
      </div>

      {/* Subtle decorative elements */}
      <div className="absolute -top-4 -right-4 -z-10 h-72 w-72 rounded-full bg-slate-100/60 blur-3xl" />
      <div className="absolute -bottom-4 -left-4 -z-10 h-48 w-48 rounded-full bg-slate-100/60 blur-2xl" />
    </div>
  );
}

function InputField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-medium text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}

function ProgressStep({
  label,
  completed,
  active,
}: {
  label: string;
  completed?: boolean;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium ${
          completed
            ? 'bg-emerald-100 text-emerald-700'
            : active
              ? 'animate-pulse bg-slate-700 text-white'
              : 'bg-slate-100 text-slate-400'
        }`}
      >
        {completed ? <Check className="h-3 w-3" /> : '○'}
      </div>
      <span
        className={`text-xs ${completed ? 'text-emerald-700' : active ? 'font-medium text-slate-700' : 'text-slate-400'}`}
      >
        {label}
      </span>
    </div>
  );
}

function CalendarMockup() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const timeSlots = [
    { day: 0, start: 1, label: 'TS Basics', color: 'bg-slate-700' },
    { day: 2, start: 0, label: 'Types', color: 'bg-slate-600' },
    { day: 4, start: 2, label: 'Practice', color: 'bg-slate-500' },
  ];

  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      {/* Day headers */}
      <div className="grid grid-cols-5 border-b border-slate-100 bg-slate-50">
        {days.map((day) => (
          <div
            key={day}
            className="py-1 text-center text-[9px] font-medium text-slate-500"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="grid grid-cols-5 gap-0.5 bg-slate-100 p-0.5">
        {days.map((day, dayIndex) => (
          <div key={day} className="flex flex-col gap-0.5">
            {[0, 1, 2].map((slotIndex) => {
              const slot = timeSlots.find(
                (s) => s.day === dayIndex && s.start === slotIndex
              );
              return (
                <div
                  key={slotIndex}
                  className={`flex h-6 items-center justify-center rounded-sm text-[8px] ${
                    slot
                      ? `${slot.color} font-medium text-white`
                      : 'bg-white text-slate-300'
                  }`}
                >
                  {slot ? slot.label : ''}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
