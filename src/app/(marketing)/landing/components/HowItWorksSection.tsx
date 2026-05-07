import { CalendarCheck, Check, ExternalLink, FileText } from 'lucide-react';
import { useId } from 'react';

interface StepCardProps {
  stepNumber: number;
  title: string;
  description: string;
  visual: React.ReactNode;
}

interface Module {
  title: string;
  items: string[];
}

/**
 * How it Works section with 3 steps showing the Atlaris process.
 * Each step includes a UI-style visual.
 */
export function HowItWorksSection() {
  const sectionId = useId();
  const headingId = `${sectionId}-heading`;

  return (
    <section
      id={sectionId}
      className="scroll-mt-20 px-4 py-12 sm:px-6 sm:py-24 lg:px-8 lg:py-32"
      aria-labelledby={headingId}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 id={headingId} className="marketing-h2 mb-4 text-foreground">
            How Atlaris forces progress
          </h2>
          <p className="marketing-subtitle mt-4 text-muted-foreground">
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
            description="One click exports your entire schedule to Google Calendar or Outlook. It shows up where you actually look."
            visual={<SyncVisual />}
          />
        </div>
      </div>
    </section>
  );
}

function StepCard({ stepNumber, title, description, visual }: StepCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-primary/30 bg-linear-to-br from-primary/10 to-white/60 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl dark:border-primary/20 dark:from-primary/5 dark:to-card/40">
      {/* Decorative glow */}
      <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-linear-to-br from-primary/40 to-accent/30 opacity-20 blur-2xl transition group-hover:opacity-40"></div>

      <div className="mb-4 flex items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-primary to-accent text-sm font-bold text-white shadow-lg"
          aria-hidden="true"
        >
          {stepNumber}
        </span>
        <h3 className="marketing-card-title">{title}</h3>
      </div>

      <p className="mb-6 leading-relaxed text-muted-foreground">
        {description}
      </p>

      {/* Visual mockup */}
      <div className="relative" aria-hidden="true">
        {visual}
      </div>
    </div>
  );
}

/** Visual 1: Structured outline */
function CurriculumVisual() {
  const modules: Module[] = [
    { title: 'Week 1-2: Foundations', items: ['Type basics', 'Interfaces'] },
    { title: 'Week 3-4: Advanced Types', items: ['Generics', 'Utility types'] },
    { title: 'Week 5-6: Real-world', items: ['React + TS', 'Testing'] },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/60 shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-card/90">
      <div className="border-b border-primary/20 bg-gradient-to-r from-primary/10 to-accent/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            TypeScript Roadmap
          </span>
        </div>
      </div>
      <div className="space-y-3 p-4">
        {modules.map((module) => (
          <div key={module.title} className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="text-primary">▼</span>
              {module.title}
            </div>
            {module.items.map((item) => (
              <div
                key={`${module.title}-${item}`}
                className="ml-5 flex items-center gap-2 text-sm text-muted-foreground"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-primary to-accent" />
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
    <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/60 shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-card/90">
      {/* Event header */}
      <div className="border-b border-primary/20 bg-gradient-to-r from-primary to-accent px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">
            TypeScript Generics
          </span>
          <span className="text-xs text-muted-foreground">Tue 9:00 AM</span>
        </div>
      </div>

      {/* Event details */}
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarCheck className="h-4 w-4 text-primary" />
          <span>1 hour · Focus time</span>
        </div>

        <div className="rounded-xl border border-primary/20 bg-linear-to-br from-primary/10 to-accent/10 p-3">
          <p className="mb-2 text-xs font-medium text-foreground uppercase">
            Resources
          </p>
          <div className="space-y-2">
            <ResourceLinkMock
              label="Official TS Docs: Generics"
              type="article"
            />
            <ResourceLinkMock label="Generics in 10 mins" type="video" />
            <ResourceLinkMock label="Practice exercises" type="exercise" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ResourceLinkMock({ label, type }: { label: string; type: string }) {
  const icons: Record<string, string> = {
    article: '📄',
    video: '▶️',
    exercise: '💻',
  };

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground transition hover:text-primary">
      <span>{icons[type]}</span>
      <span className="truncate">{label}</span>
      <ExternalLink className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-primary/60" />
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
          color="bg-linear-to-br from-blue-400 to-blue-600"
        />
        <IntegrationIcon
          name="Outlook"
          color="bg-linear-to-br from-sky-400 to-sky-600"
        />
      </div>

      {/* Sync toast notification */}
      <div className="mx-auto max-w-[220px] overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 to-accent/10 shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-card/90">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="brand-fill flex h-8 w-8 items-center justify-center rounded-xl shadow-md">
            <Check className="h-4 w-4 text-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-primary">Schedule synced</p>
            <p className="text-xs text-muted-foreground">
              24 events added to calendar
            </p>
          </div>
        </div>
      </div>

      {/* Lock screen preview */}
      <div className="mx-auto max-w-[160px] overflow-hidden rounded-2xl border-2 border-white/60 bg-gradient-to-b from-muted to-card shadow-xl dark:border-white/20">
        <div className="bg-gradient-to-r from-primary/20 to-accent/20 px-3 py-1.5 text-center">
          <span className="text-[10px] font-medium text-muted-foreground">
            9:41 AM
          </span>
        </div>
        <div className="p-3">
          <div className="rounded-xl border border-white/60 bg-white/80 p-3 shadow-md backdrop-blur-sm dark:border-white/20 dark:bg-card/60">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-foreground">
                Coming up
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
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
      role="img"
      aria-label={name}
    >
      <span className="text-lg font-semibold text-white" aria-hidden="true">
        {name.charAt(0)}
      </span>
    </div>
  );
}
