import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatMinutes } from '@/features/plans/formatters';
import type { ModuleDetailTask } from '@/features/plans/read-projection/types';
import { cn } from '@/lib/utils';
import { RESOURCE_CONFIG } from './lessonAccordionStyles';

type LessonResources = NonNullable<ModuleDetailTask['resources']>;

function LearningResourceCard({
  resource,
}: {
  resource: LessonResources[number];
}) {
  const config = RESOURCE_CONFIG[resource.type];
  const Icon = config.icon;

  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group/resource flex items-start gap-3 rounded-xl border border-panel-border bg-panel p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md dark:hover:border-primary/30"
    >
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg',
          config.badgeClass,
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="truncate font-medium text-foreground group-hover/resource:text-primary">
            {resource.title}
          </span>
          <ExternalLink className="size-3 shrink-0 opacity-50" />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge
            className={cn(
              'rounded border-transparent px-1.5',
              config.badgeClass,
            )}
          >
            {config.label}
          </Badge>
          {resource.durationMinutes ? (
            <span>{formatMinutes(resource.durationMinutes)}</span>
          ) : null}
        </div>
        {resource.notes ? (
          <p className="mt-2 text-xs text-muted-foreground">{resource.notes}</p>
        ) : null}
      </div>
    </a>
  );
}

export function LessonResourceList({
  resources,
}: {
  resources: LessonResources;
}) {
  if (resources.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <h4 className="mb-3 text-sm font-medium text-foreground">
        Learning Resources
      </h4>
      <div className="grid gap-3 sm:grid-cols-2">
        {resources.map((resource) => (
          <LearningResourceCard key={resource.id} resource={resource} />
        ))}
      </div>
    </div>
  );
}
