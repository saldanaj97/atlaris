import type { ReactElement } from 'react';

import { SETTINGS_SECTIONS } from '@/app/(app)/settings/settings-section-ids';
import { APP_SHELL_SCROLL_MARGIN } from '@/components/layout/app-shell-width';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Skeleton for the profile identity card and name/email fields. */
export function ProfileFormSkeleton(): ReactElement {
  return (
    <Card
      as='section'
      id={SETTINGS_SECTIONS.profile}
      className={cn(APP_SHELL_SCROLL_MARGIN, 'gap-4 shadow-none')}
    >
      <CardHeader>
        <CardTitle as='h2' className='text-xl leading-7'>
          Profile
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex min-w-0 items-center gap-4'>
          <Skeleton className='size-16 shrink-0 rounded-full' />
          <div className='min-w-0 flex-1 space-y-2'>
            <Skeleton className='h-6 w-40 max-w-full' />
            <Skeleton className='h-4 w-52 max-w-full' />
            <Skeleton className='h-3 w-28 max-w-full' />
          </div>
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Skeleton className='h-16 w-full' />
          <Skeleton className='h-16 w-full' />
        </div>
      </CardContent>
    </Card>
  );
}

/** Skeleton for the profile plan summary card. */
export function ProfilePlanCardSkeleton(): ReactElement {
  return (
    <Card as='section' className='gap-4 shadow-none'>
      <CardHeader>
        <CardTitle as='h3' className='text-xl leading-7'>
          Plan
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Skeleton className='h-40 w-full' />
      </CardContent>
    </Card>
  );
}
