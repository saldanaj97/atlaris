'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function RegenerateButton({ planId }: { planId: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      disabled={loading}
      onClick={() => {
        void (async () => {
          setLoading(true);
          try {
            const res = await fetch(`/api/v1/plans/${planId}/regenerate`, {
              method: 'POST',
            });
            if (!res.ok) {
              toast.error('Failed to enqueue regeneration');
              return;
            }
            toast.success('Plan regeneration started');
          } catch (e) {
            console.error(e);
            toast.error('An error occurred while regenerating the plan');
          } finally {
            setLoading(false);
          }
        })();
      }}
    >
      {loading ? 'Regenerating…' : 'Regenerate Plan'}
    </Button>
  );
}
