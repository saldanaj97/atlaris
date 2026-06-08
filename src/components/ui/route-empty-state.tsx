import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';

interface RouteEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Shared route-level empty state: sentence-case title, consistent CTA sizing.
 */
export function RouteEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: RouteEmptyStateProps) {
  return (
    <Empty className={cn(className)}>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
