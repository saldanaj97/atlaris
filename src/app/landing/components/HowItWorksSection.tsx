import { CalendarCheck, Check, ExternalLink, FileText } from 'lucide-react';

/**
 * How it Works section with 3 steps showing the Pathfinder process.
 * Each step includes a UI-style visual.
 */
export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
      aria-labelledby="how-it-works-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2
            id="how-it-works-heading"
            className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl"
          >
            How Pathfinder forces progress
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            A three-step system that turns intention into action
          </p>
        </div>

        <div className="grid gap-12 lg:grid-cols-3 lg:gap-8">
          {/* Step 1: Curriculum */}
          <StepCard
            stepNumber={1}
            title="Curriculum that respects reality"
            description="Your roadmap adapts to your actual time, experience level, and learning goals—not a generic template."
            visual={<CurriculumVisual />}
          />

          {/* Step 2: Resources */}
          <StepCard
            stepNumber={2}
            title="Resources chosen, not dumped"
            description="Each learning block comes with curated resources—articles, videos, exercises—attached directly to your schedule."
            visual={<ResourcesVisual />}
          />

          {/* Step 3: Sync */}
          <StepCard
            stepNumber={3}
            title="Sync to your real life"
            description="One click exports your entire schedule to Google Calendar, Notion, or Outlook. It shows up where you actually look."
            visual={<SyncVisual />}
            emphasized
          />
        </div>
      </div>
    </section>
  );
}

interface StepCardProps {
  stepNumber: number;
  title: string;
  description: string;
  visual: React.ReactNode;
  emphasized?: boolean;
}

function StepCard({
  stepNumber,
  title,
  description,
  visual,
  emphasized,
}: StepCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-6 transition-shadow hover:shadow-md ${
        emphasized
          ? 'border-slate-300 bg-gradient-to-br from-slate-50 to-white'
          : 'border-slate-200 bg-white'
      }`}
      role="article"
    >
      <div className="mb-4 flex items-center gap-3">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
            emphasized
              ? 'bg-slate-700 text-white'
              : 'bg-slate-100 text-slate-600'
          }`}
          aria-hidden="true"
        >
          {stepNumber}
        </span>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      </div>

      <p className="mb-6 text-slate-600">{description}</p>

      {/* Visual mockup */}
      <div className="relative" aria-hidden="true">
        {visual}
      </div>
    </div>
  );
}

/** Visual 1: Notion-like outline */
function CurriculumVisual() {
  const modules = [
    { title: 'Week 1-2: Foundations', items: ['Type basics', 'Interfaces'] },
    { title: 'Week 3-4: Advanced Types', items: ['Generics', 'Utility types'] },
    { title: 'Week 5-6: Real-world', items: ['React + TS', 'Testing'] },
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-medium text-slate-600">
            TypeScript Roadmap
          </span>
        </div>
      </div>
      <div className="space-y-2 p-3">
        {modules.map((module, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <span className="text-slate-400">▼</span>
              {module.title}
            </div>
            {module.items.map((item, itemIdx) => (
              <div
                key={itemIdx}
                className="ml-4 flex items-center gap-2 text-xs text-slate-500"
              >
                <div className="h-1 w-1 rounded-full bg-slate-300" />
                {item}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Visual 2: Calendar event with resource link */
function ResourcesVisual() {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/* Event header */}
      <div className="border-b border-slate-100 bg-slate-700 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white">
            TypeScript Generics
          </span>
          <span className="text-[10px] text-slate-300">Tue 9:00 AM</span>
        </div>
      </div>

      {/* Event details */}
      <div className="space-y-3 p-3">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <CalendarCheck className="h-3.5 w-3.5 text-slate-400" />
          <span>1 hour · Focus time</span>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
          <p className="mb-1 text-[10px] font-medium text-slate-400 uppercase">
            Resources
          </p>
          <div className="space-y-1.5">
            <ResourceLink label="Official TS Docs: Generics" type="article" />
            <ResourceLink label="Generics in 10 mins" type="video" />
            <ResourceLink label="Practice exercises" type="exercise" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ResourceLink({ label, type }: { label: string; type: string }) {
  const icons: Record<string, string> = {
    article: '📄',
    video: '▶️',
    exercise: '💻',
  };

  return (
    <div className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-900">
      <span>{icons[type]}</span>
      <span className="truncate">{label}</span>
      <ExternalLink className="ml-auto h-3 w-3 flex-shrink-0 text-slate-400" />
    </div>
  );
}

/** Visual 3: Integrations + sync toast */
function SyncVisual() {
  return (
    <div className="space-y-3">
      {/* Integrations row */}
      <div className="flex items-center justify-center gap-3">
        <IntegrationIcon name="Google Calendar" color="bg-blue-500" />
        <IntegrationIcon name="Notion" color="bg-slate-900" />
        <IntegrationIcon name="Outlook" color="bg-sky-600" />
      </div>

      {/* Sync toast notification */}
      <div className="mx-auto max-w-[200px] overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50 shadow-sm">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200">
            <Check className="h-3 w-3 text-emerald-700" />
          </div>
          <div>
            <p className="text-xs font-medium text-emerald-800">
              Schedule synced
            </p>
            <p className="text-[10px] text-emerald-600">
              24 events added to calendar
            </p>
          </div>
        </div>
      </div>

      {/* Lock screen preview */}
      <div className="mx-auto max-w-[140px] overflow-hidden rounded-xl border-2 border-slate-300 bg-slate-100">
        <div className="bg-slate-200 px-2 py-1 text-center">
          <span className="text-[8px] font-medium text-slate-500">9:41 AM</span>
        </div>
        <div className="p-2">
          <div className="rounded-md bg-white p-2 shadow-sm">
            <div className="flex items-center gap-1.5">
              <CalendarCheck className="h-3 w-3 text-slate-600" />
              <span className="text-[9px] font-medium text-slate-700">
                Coming up
              </span>
            </div>
            <p className="mt-1 text-[8px] text-slate-500">
              TypeScript: Types • 9am
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntegrationIcon({ name, color }: { name: string; color: string }) {
  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-lg ${color} shadow-sm`}
      title={name}
    >
      <span className="text-base text-white">
        {name === 'Google Calendar' ? 'G' : name === 'Notion' ? 'N' : 'O'}
      </span>
    </div>
  );
}
