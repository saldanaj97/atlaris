'use client';

import { useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';

import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';
import { createCheckoutResponseSchema } from '@/lib/validation/stripe';
import { toast } from 'sonner';

interface SubscribeButtonProps {
  priceId: string;
  label?: string;
  variant?: 'default' | 'outline' | 'secondary';
  className?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export default function SubscribeButton({
  priceId,
  label = 'Subscribe',
  variant = 'default',
  className,
  successUrl,
  cancelUrl,
}: SubscribeButtonProps): ReactElement {
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef(false);

  async function handleClick() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setLoading(true);

    try {
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
        const missingSessionUrl = parsed.error.issues.some(
          (issue) => issue.path[0] === 'sessionUrl'
        );
        const message = missingSessionUrl
          ? 'Missing session URL'
          : (parsed.error.issues[0]?.message ?? 'Invalid checkout response');
        throw new Error(message);
      }

      window.location.href = parsed.data.sessionUrl;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong';
      clientLogger.error('Failed to start checkout', {
        cancelUrl,
        error: err,
        priceId,
        successUrl,
      });
      toast.error('Unable to start checkout', { description: message });
      setLoading(false);
      pendingRef.current = false;
    }
  }

  return (
    <Button
      variant={variant}
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
