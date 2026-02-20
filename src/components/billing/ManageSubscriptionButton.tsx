'use client';

import { Button } from '@/components/ui/button';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';
import { createPortalResponseSchema } from '@/lib/validation/stripe';

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
          returnUrl,
        });
        throw new Error(parsedError.error);
      }

      const raw: unknown = await res.json();
      const parsed = createPortalResponseSchema.safeParse(raw);
      if (!parsed.success) {
        clientLogger.error('Invalid billing portal response shape', {
          parseError: parsed.error.issues,
          returnUrl,
        });
        const portalUrlIssue = parsed.error.issues.find(
          (issue) => issue.path[0] === 'portalUrl'
        );
        const message =
          portalUrlIssue?.message ??
          parsed.error.issues[0]?.message ??
          'Invalid billing portal response';
        throw new Error(message);
      }

      const portalUrl = new URL(parsed.data.portalUrl);
      if (portalUrl.protocol !== 'http:' && portalUrl.protocol !== 'https:') {
        throw new Error('Invalid billing portal URL protocol.');
      }

      window.location.href = portalUrl.toString();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong';
      toast.error('Unable to open billing portal', { description: message });
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
