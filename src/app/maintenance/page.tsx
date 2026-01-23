import { ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter } from '@/components/ui/card';

export default function MaintenancePage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <Card className="w-full max-w-2xl text-center">
        <CardContent className="space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="border-border bg-primary animate-pulse rounded-full border-2 p-5 shadow-lg">
              <ShieldAlert className="text-primary-foreground h-10 w-10" />
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex justify-center">
            <Badge className="gap-2">
              <span className="relative flex h-2 w-2">
                <span className="bg-primary-foreground absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"></span>
                <span className="bg-primary-foreground relative inline-flex h-2 w-2 rounded-full"></span>
              </span>
              System Maintenance in Progress
            </Badge>
          </div>

          {/* Title */}
          <h1 className="font-heading text-foreground text-3xl md:text-4xl">
            We're Currently Under Maintenance
          </h1>

          {/* Subtitle */}
          <p className="text-foreground text-lg opacity-70">
            Our platform is temporarily unavailable while we perform important
            updates and improvements.
          </p>

          {/* Message Box */}
          <div className="border-border bg-secondary rounded-lg border p-6 text-left">
            <div className="space-y-4">
              <p className="text-foreground leading-relaxed">
                We sincerely apologize for any inconvenience this may cause. Our
                team is actively working on critical fixes and system
                enhancements to improve your experience.
              </p>
              <p className="text-foreground leading-relaxed">
                <span className="text-primary font-semibold">Good news:</span>{' '}
                We're in the process of migrating to a zero-downtime
                infrastructure. Once complete, future updates will occur
                seamlessly without interrupting your service.
              </p>
              <p className="text-foreground leading-relaxed">
                We appreciate your patience and understanding as we work to make
                Atlaris better for you.
              </p>
            </div>
          </div>
        </CardContent>

        {/* Footer */}
        <CardFooter className="border-border flex-col gap-2 border-t-2 text-center">
          <p className="text-foreground text-sm opacity-60">
            Expected to be back online shortly
          </p>
          <p className="text-foreground text-sm opacity-60">
            If you have urgent questions, please contact our support team
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
