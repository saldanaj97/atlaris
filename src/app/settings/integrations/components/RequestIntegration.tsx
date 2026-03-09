import type { JSX } from 'react';

import { MessageSquare } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function RequestIntegration(): JSX.Element {
  return (
    <Card className="dark:bg-card/40 relative overflow-hidden rounded-3xl border-white/30 bg-white/30 text-center backdrop-blur-sm dark:border-white/5">
      <CardHeader className="gap-1">
        <CardTitle className="text-lg">Don&apos;t see what you need?</CardTitle>
        <CardDescription className="mx-auto max-w-md">
          We&apos;re always looking to add new integrations. Let us know what
          tools you&apos;d like to connect.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mt-5">
          <Button variant="outline" disabled>
            <MessageSquare className="mr-2 h-4 w-4" />
            Request Integration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
