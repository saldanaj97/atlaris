import { CalendarCheck, Check, ExternalLink, FileText } from 'lucide-react';

/**
 * How it Works section with 3 steps showing the Atlaris process.
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
            How Atlaris forces progress
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
      className={`group relative overflow-hidden rounded-3xl border p-8 backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl ${
        emphasized
          ? 'border-purple-200/50 bg-gradient-to-br from-purple-50/80 to-white/60 shadow-xl'
          : 'border-white/50 bg-white/40 shadow-lg'
      }`}
      role="article"
    >
      {/* Decorative glow */}
      <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br from-purple-300 to-pink-200 opacity-20 blur-2xl transition group-hover:opacity-40"></div>

      <div className="mb-4 flex items-center gap-3">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold shadow-lg ${
            emphasized
              ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
              : 'bg-gradient-to-br from-gray-100 to-white text-gray-600'
          }`}
          aria-hidden="true"
        >
          {stepNumber}
        </span>
        <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
      </div>

      <p className="mb-6 leading-relaxed text-gray-600">{description}</p>

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
    <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/60 shadow-lg backdrop-blur-sm">
      <div className="border-b border-purple-100 bg-gradient-to-r from-purple-50/80 to-pink-50/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-purple-500" />
          <span className="text-sm font-medium text-gray-700">
            TypeScript Roadmap
          </span>
        </div>
      </div>
      <div className="space-y-3 p-4">
        {modules.map((module, idx) => (
          <div key={idx} className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
              <span className="text-purple-400">▼</span>
              {module.title}
            </div>
            {module.items.map((item, itemIdx) => (
              <div
                key={itemIdx}
                className="ml-5 flex items-center gap-2 text-sm text-gray-500"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-purple-400 to-pink-400" />
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
    <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/60 shadow-lg backdrop-blur-sm">
      {/* Event header */}
      <div className="border-b border-purple-100 bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white">
            TypeScript Generics
          </span>
          <span className="text-xs text-white/80">Tue 9:00 AM</span>
        </div>
      </div>

      {/* Event details */}
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <CalendarCheck className="h-4 w-4 text-purple-500" />
          <span>1 hour · Focus time</span>
        </div>

        <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50/50 to-pink-50/50 p-3">
          <p className="mb-2 text-xs font-medium text-purple-600 uppercase">
            Resources
          </p>
          <div className="space-y-2">
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
    <div className="flex items-center gap-2 text-sm text-gray-600 transition hover:text-purple-600">
      <span>{icons[type]}</span>
      <span className="truncate">{label}</span>
      <ExternalLink className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-purple-400" />
    </div>
  );
}

/** Visual 3: Integrations + sync toast */
function SyncVisual() {
  return (
    <div className="space-y-4">
      {/* Integrations row */}
      <div className="flex items-center justify-center gap-4">
        <IntegrationIcon
          name="Google Calendar"
          color="bg-gradient-to-br from-blue-400 to-blue-600"
        />
        <IntegrationIcon
          name="Notion"
          color="bg-gradient-to-br from-gray-700 to-gray-900"
        />
        <IntegrationIcon
          name="Outlook"
          color="bg-gradient-to-br from-sky-400 to-sky-600"
        />
      </div>

      {/* Sync toast notification */}
      <div className="mx-auto max-w-[220px] overflow-hidden rounded-2xl border border-emerald-200/50 bg-gradient-to-r from-emerald-50/80 to-green-50/80 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-green-500 shadow-md">
            <Check className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-800">
              Schedule synced
            </p>
            <p className="text-xs text-emerald-600">
              24 events added to calendar
            </p>
          </div>
        </div>
      </div>

      {/* Lock screen preview */}
      <div className="mx-auto max-w-[160px] overflow-hidden rounded-2xl border-2 border-white/60 bg-gradient-to-b from-gray-100 to-gray-200 shadow-xl">
        <div className="bg-gradient-to-r from-purple-100/80 to-pink-100/80 px-3 py-1.5 text-center">
          <span className="text-[10px] font-medium text-gray-600">9:41 AM</span>
        </div>
        <div className="p-3">
          <div className="rounded-xl border border-white/60 bg-white/80 p-3 shadow-md backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-purple-500" />
              <span className="text-xs font-medium text-gray-700">
                Coming up
              </span>
            </div>
            <p className="mt-1 text-[10px] text-gray-500">
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
      className={`flex h-12 w-12 items-center justify-center rounded-xl ${color} shadow-lg transition hover:scale-105 hover:shadow-xl`}
      title={name}
    >
      <span className="text-lg font-semibold text-white">
        {name === 'Google Calendar' ? 'G' : name === 'Notion' ? 'N' : 'O'}
      </span>
    </div>
  );
}
