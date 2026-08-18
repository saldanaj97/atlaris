import type { ModuleDetailNavItem } from '@/features/plans/read-projection/types';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Lock,
} from 'lucide-react';
import Link from 'next/link';

function ModuleSwitcherMenuItem({
  planId,
  moduleId,
  item,
}: {
  planId: string;
  moduleId: string;
  item: ModuleDetailNavItem;
}) {
  const isCurrent = item.id === moduleId;

  if (item.isLocked) {
    return (
      <DropdownMenuItem disabled className='opacity-50'>
        <span className='flex items-center gap-2 text-muted-foreground/50'>
          <Lock className='size-4 shrink-0' />
          <span className='truncate'>{item.title}</span>
        </span>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem asChild>
      <Link
        href={`/plans/${planId}/modules/${item.id}`}
        className={cn(
          'flex items-center gap-2',
          isCurrent && 'bg-primary/20 text-primary',
        )}
        aria-label={item.isComplete ? `${item.title}, completed` : undefined}
      >
        <span className='flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary'>
          {item.order}
        </span>
        <span className='truncate'>{item.title}</span>
        {item.isComplete ? (
          <CheckCircle2
            className='ml-auto size-4 shrink-0 text-success'
            aria-hidden
          />
        ) : null}
      </Link>
    </DropdownMenuItem>
  );
}

export function ModuleBreadcrumbNav({
  planId,
  planTopic,
  moduleId,
  moduleOrder,
  allModules,
  isComplete,
}: {
  planId: string;
  planTopic: string;
  moduleId: string;
  moduleOrder: number;
  allModules: ModuleDetailNavItem[];
  isComplete: boolean;
}) {
  return (
    <nav className='mb-6'>
      <ol className='flex items-center gap-1 text-sm'>
        <li>
          <Link
            href={`/plans/${planId}`}
            className='inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none'
          >
            <ArrowLeft className='size-3.5' />
            <span className='max-w-56 truncate sm:max-w-88'>{planTopic}</span>
          </Link>
        </li>
        <li className='text-muted-foreground/40'>
          <ChevronRight className='size-4' />
        </li>
        <li>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={
                isComplete
                  ? `Module ${moduleOrder}, completed`
                  : `Module ${moduleOrder}`
              }
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
                isComplete
                  ? 'bg-success/15 text-success hover:bg-success/25 dark:bg-success/25 dark:text-success-foreground dark:hover:bg-success/30'
                  : 'bg-primary/10 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:text-primary dark:hover:bg-primary/30',
              )}
            >
              {isComplete ? (
                <CheckCircle2 className='size-3.5' aria-hidden />
              ) : null}
              Module {moduleOrder}
              <ChevronDown className='size-3.5' />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align='start'
              className='max-h-80 w-64 overflow-y-auto'
            >
              {allModules.map((item) => (
                <ModuleSwitcherMenuItem
                  key={item.id}
                  planId={planId}
                  moduleId={moduleId}
                  item={item}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      </ol>
    </nav>
  );
}
