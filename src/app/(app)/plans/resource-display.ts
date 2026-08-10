import type { ResourceType } from '@/shared/types/db.types';
import type { ElementType } from 'react';

import { FileText, Link as LinkIcon, PlayCircle, Target } from 'lucide-react';

export const PLAN_RESOURCE_DISPLAY: Record<
  ResourceType,
  { label: string; icon: ElementType; badgeClass: string }
> = {
  video: {
    label: 'Video',
    icon: PlayCircle,
    badgeClass:
      'bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive',
  },
  article: {
    label: 'Article',
    icon: FileText,
    badgeClass:
      'bg-chart-3/10 text-chart-3 dark:bg-chart-3/20 dark:text-chart-3',
  },
  course: {
    label: 'Course',
    icon: Target,
    badgeClass:
      'bg-warning/10 text-warning dark:bg-warning/20 dark:text-warning',
  },
  doc: {
    label: 'Documentation',
    icon: FileText,
    badgeClass:
      'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary',
  },
  other: {
    label: 'Resource',
    icon: LinkIcon,
    badgeClass: 'bg-muted text-muted-foreground dark:bg-muted/80',
  },
};

export function getResourceIcon(type: ResourceType): ElementType {
  return PLAN_RESOURCE_DISPLAY[type].icon;
}
