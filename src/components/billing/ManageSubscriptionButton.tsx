'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ManageSubscriptionButtonProps {
  label?: string;
  className?: string;
  returnUrl?: string;
}

export default function ManageSubscriptionButton({
  label = 'Manage Subscription',
  className,
  returnUrl,
}: ManageSubscriptionButtonProps) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
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
        const text = await res.text();
        throw new Error(text || 'Failed to open billing portal');
      }

      const data = (await res.json()) as { portalUrl?: string };
      if (!data.portalUrl) throw new Error('Missing portal URL');

      window.location.href = data.portalUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast.error('Unable to open billing portal', { description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button className={className} disabled={loading} onClick={onClick}>
      {loading ? 'Opening…' : label}
    </Button>
  );
}

