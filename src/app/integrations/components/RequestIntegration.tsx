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
    <Card className="dark:bg-card/40 relative overflow-hidden rounded-3xl border border-white/30 bg-white/30 backdrop-blur-sm dark:border-white/5">
      <CardHeader className="pb-2 text-center">
        <CardTitle className="text-lg">Don&apos;t see what you need?</CardTitle>
        <CardDescription className="mx-auto max-w-md">
          We&apos;re always looking to add new integrations. Let us know what
          tools you&apos;d like to connect.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        {/* TODO: Implement integration request form/modal */}
        <Button variant="outline" disabled>
          <MessageSquare className="mr-2 h-4 w-4" />
          Request Integration
        </Button>
      </CardContent>
    </Card>
  );
}
