import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { ShieldAlert, Wrench } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Maintenance | Atlaris',
  description:
    'Atlaris is temporarily unavailable while we perform maintenance and infrastructure upgrades.',
  openGraph: {
    title: 'Maintenance | Atlaris',
    description:
      'Atlaris is temporarily unavailable while we perform maintenance and infrastructure upgrades.',
    url: '/maintenance',
    images: ['/og-default.jpg'],
  },
};

export default function MaintenancePage() {
  return (
    <div className='flex min-h-screen items-center justify-center bg-background p-4 sm:p-6'>
      <Card className='w-full max-w-lg gap-5 py-5 text-center sm:py-6'>
        <CardContent className='space-y-5 px-5 sm:px-6'>
          <div className='flex justify-center'>
            <div className='animate-pulse rounded-full border border-primary/20 bg-primary p-4 shadow-sm motion-reduce:animate-none'>
              <ShieldAlert
                className='size-7 text-primary-foreground'
                aria-hidden='true'
              />
            </div>
          </div>

          <div className='flex justify-center'>
            <Badge variant='default' className='gap-2 px-3 py-1'>
              <span className='relative flex size-2'>
                <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-foreground opacity-75 motion-reduce:animate-none'></span>
                <span className='relative inline-flex size-2 rounded-full bg-primary-foreground'></span>
              </span>
              Maintenance Active
            </Badge>
          </div>

          <h1 className='font-heading text-2xl text-foreground sm:text-3xl'>
            Atlaris is temporarily unavailable
          </h1>

          <p className='mx-auto max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base'>
            Scheduled maintenance is in progress. Plan creation, settings, and
            analytics are paused until service resumes.
          </p>

          <div className='rounded-lg border border-border bg-muted/40 p-4 text-left'>
            <div className='flex items-start gap-3'>
              <Wrench
                className='mt-0.5 size-4 shrink-0 text-primary'
                aria-hidden='true'
              />
              <div className='space-y-2 text-sm'>
                <p>
                  <span className='font-medium text-foreground'>Status:</span>{' '}
                  systems are being updated.
                </p>
                <p>
                  <span className='font-medium text-foreground'>Recovery:</span>{' '}
                  expected shortly.
                </p>
                <p>
                  <span className='font-medium text-foreground'>
                    Need help?
                  </span>{' '}
                  Contact support with your account email.
                </p>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className='border-t border-border px-5 text-center sm:px-6'>
          <p className='w-full text-sm text-muted-foreground'>
            Refresh this page in a few minutes for the latest state.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
