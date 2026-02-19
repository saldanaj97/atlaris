'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';

interface ManageSubscriptionButtonProps {
  label?: string;
  className?: string;
  returnUrl?: string;
}

export default function ManageSubscriptionButton({
  label = 'Manage Subscription',
  className,
  returnUrl,
}: ManageSubscriptionButtonProps): React.ReactElement {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/stripe/create-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ returnUrl }),
      });

      if (!res.ok) {
        const parsedError = await parseApiErrorResponse(
          res,
          'Failed to open billing portal'
        );
        clientLogger.error('Failed to open billing portal', {
          parsedError,
          returnUrl: returnUrl ?? undefined,
        });
        throw new Error(parsedError.error);
      }

      const data = (await res.json()) as { portalUrl?: string };
      if (!data.portalUrl) throw new Error('Missing portal URL');

      window.location.href = data.portalUrl;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong';
      toast.error('Unable to open billing portal', { description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      className={className}
      disabled={loading}
      onClick={() => {
        void handleClick();
      }}
    >
      {loading ? 'Opening…' : label}
    </Button>
  );
}
