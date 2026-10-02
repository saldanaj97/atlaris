import {
  APP_SHELL_COLUMN,
  APP_SHELL_GUTTER,
  APP_SHELL_SIDEBAR_OFFSET,
} from '@/components/layout/app-shell-width';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Suspense fallback for the async `SiteHeader`. Mirrors its fixed 64px strip
 * and the desktop sidebar column so the shell does not shift when the real
 * header streams in.
 */
export default function SiteHeaderFallback() {
  return (
    <div
      aria-hidden='true'
      className='fixed top-0 left-0 z-50 w-full pt-[env(safe-area-inset-top,0px)] pr-[env(safe-area-inset-right,0px)] pl-[env(safe-area-inset-left,0px)]'
    >
      <div className='absolute inset-0 z-0 bg-background' />
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden w-[var(--at-app-sidebar-offset,var(--at-semantic-layout-sidebar,14rem))] border-r border-border bg-background lg:block',
        )}
      />
      <div className={cn('relative z-10', APP_SHELL_SIDEBAR_OFFSET)}>
        <div className={APP_SHELL_GUTTER}>
          <div className={cn(APP_SHELL_COLUMN, 'flex h-[64px] items-center')}>
            <Skeleton className='h-6 w-28 lg:hidden' />
          </div>
        </div>
      </div>
    </div>
  );
}
