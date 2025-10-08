'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

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
}: SubscribeButtonProps) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
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
        const text = await res.text();
        throw new Error(text || 'Failed to start checkout');
      }

      const data = (await res.json()) as { sessionUrl?: string };
      if (!data.sessionUrl) throw new Error('Missing session URL');

      window.location.href = data.sessionUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast.error('Unable to start checkout', { description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button className={className} disabled={loading} onClick={onClick}>
      {loading ? 'Redirecting…' : label}
    </Button>
  );
}

