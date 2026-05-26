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
      'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400',
  },
  article: {
    label: 'Article',
    icon: FileText,
    badgeClass:
      'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400',
  },
  course: {
    label: 'Course',
    icon: Target,
    badgeClass:
      'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400',
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
