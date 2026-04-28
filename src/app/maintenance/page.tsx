import { ShieldAlert } from 'lucide-react';
import type { Metadata } from 'next';
import type { JSX } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter } from '@/components/ui/card';

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

export default function MaintenancePage(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <Card className="w-full max-w-2xl text-center">
        <CardContent className="space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="animate-pulse rounded-full border-2 border-border bg-primary p-5 shadow-lg motion-reduce:animate-none">
              <ShieldAlert
                className="h-10 w-10 text-primary-foreground"
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex justify-center">
            <Badge variant="default" className="gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-foreground opacity-75 motion-reduce:animate-none"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-foreground"></span>
              </span>
              System Maintenance in Progress
            </Badge>
          </div>

          {/* Title */}
          <h1 className="font-heading text-3xl text-foreground md:text-4xl">
            We're Currently Under Maintenance
          </h1>

          {/* Subtitle */}
          <p className="text-lg text-foreground opacity-70">
            Our platform is temporarily unavailable while we perform important
            updates and improvements.
          </p>

          {/* Message Box */}
          <div className="rounded-lg border border-border bg-secondary p-6 text-left">
            <div className="space-y-4">
              <p className="leading-relaxed text-foreground">
                We sincerely apologize for any inconvenience this may cause. Our
                team is actively working on critical fixes and system
                enhancements to improve your experience.
              </p>
              <p className="leading-relaxed text-foreground">
                <span className="font-semibold text-primary">Good news:</span>{' '}
                We're in the process of migrating to a zero-downtime
                infrastructure. Once complete, future updates will occur
                seamlessly without interrupting your service.
              </p>
              <p className="leading-relaxed text-foreground">
                We appreciate your patience and understanding as we work to make
                Atlaris better for you.
              </p>
            </div>
          </div>
        </CardContent>

        {/* Footer */}
        <CardFooter className="flex-col gap-2 border-t-2 border-border text-center">
          <p className="text-sm text-foreground opacity-60">
            Expected to be back online shortly
          </p>
          <p className="text-sm text-foreground opacity-60">
            If you have urgent questions, please contact our support team
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
