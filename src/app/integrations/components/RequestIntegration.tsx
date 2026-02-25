import { MessageSquare } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function RequestIntegration() {
  return (
    <div className="dark:bg-card/40 relative overflow-hidden rounded-3xl border border-white/30 bg-white/30 p-8 text-center backdrop-blur-sm dark:border-white/5">
      {/* TODO: Implement integration request form/modal */}
      <h2 className="text-lg font-semibold">Don&apos;t see what you need?</h2>
      <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">
        We&apos;re always looking to add new integrations. Let us know what
        tools you&apos;d like to connect.
      </p>
      <div className="mt-5">
        <Button variant="outline">
          <MessageSquare className="mr-2 h-4 w-4" />
          Request Integration
        </Button>
      </div>
    </div>
  );
}
