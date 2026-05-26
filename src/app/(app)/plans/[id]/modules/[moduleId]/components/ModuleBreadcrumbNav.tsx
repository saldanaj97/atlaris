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

  const linkClassName = cn(
    'flex items-center gap-2',
    isCurrent && 'bg-primary/20 text-primary',
  );

  return (
    <DropdownMenuItem asChild>
      <Link
        href={`/plans/${planId}/modules/${item.id}`}
        className={linkClassName}
      >
        <span className='flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary'>
          {item.order}
        </span>
        <span className='truncate'>{item.title}</span>
        {isCurrent && (
          <CheckCircle2 className='ml-auto size-4 shrink-0 text-primary' />
        )}
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
}: {
  planId: string;
  planTopic: string;
  moduleId: string;
  moduleOrder: number;
  allModules: ModuleDetailNavItem[];
}) {
  return (
    <nav className='mb-6'>
      <ol className='flex items-center gap-1 text-sm'>
        <li>
          <Link
            href={`/plans/${planId}`}
            className='inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-primary'
          >
            <ArrowLeft className='h-3.5 w-3.5' />
            <span className='max-w-56 truncate sm:max-w-88'>{planTopic}</span>
          </Link>
        </li>
        <li className='text-muted-foreground/40'>
          <ChevronRight className='h-4 w-4' />
        </li>
        <li>
          <DropdownMenu>
            <DropdownMenuTrigger className='inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 font-medium text-primary transition-colors hover:bg-primary/20 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background focus:outline-none dark:bg-primary/20 dark:text-primary dark:hover:bg-primary/30'>
              Module {moduleOrder}
              <ChevronDown className='h-3.5 w-3.5' />
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
