'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

import { parseApiErrorResponse } from '@/lib/api/error-response';
import { createCheckoutResponseSchema } from '@/lib/validation/stripe';

interface SubscribeButtonProps {
  priceId: string;
  label?: string;
  className?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export default function SubscribeButton({
  priceId,
  label = 'Subscribe',
  className,
  successUrl,
  cancelUrl,
}: SubscribeButtonProps): ReactElement {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priceId, successUrl, cancelUrl }),
      });

      if (!res.ok) {
        const parsedError = await parseApiErrorResponse(
          res,
          'Failed to start checkout'
        );
        throw new Error(parsedError.error);
      }

      const raw: unknown = await res.json();
      const parsed = createCheckoutResponseSchema.safeParse(raw);
      if (!parsed.success) {
        const message =
          parsed.error.issues[0]?.message ?? 'Invalid checkout response';
        throw new Error(message);
      }

      window.location.href = parsed.data.sessionUrl;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong';
      toast.error('Unable to start checkout', { description: message });
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
      {loading ? 'Redirecting…' : label}
    </Button>
  );
}
