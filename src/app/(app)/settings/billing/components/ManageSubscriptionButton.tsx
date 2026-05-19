'use client';

import { type ReactElement, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  getClientErrorMessage,
  requestPostJson,
} from '@/app/_shared/client-api';
import { Button } from '@/components/ui/button';
import { createPortalResponseSchema } from '@/features/billing/validation/stripe';
import { clientLogger } from '@/lib/logging/client';

const PORTAL_TIMEOUT_MS = 15_000;

type ManageSubscriptionButtonProps = {
  label?: string;
  className?: string;
  returnUrl?: string;
  canOpenBillingPortal: boolean;
};

type PortalRequestResult =
  | { kind: 'success'; portalUrl: string }
  | {
      kind: 'error';
      message: string;
      error: unknown;
      reason:
        | 'timeout'
        | 'api'
        | 'invalid-response'
        | 'invalid-url'
        | 'network';
    };

function normalizePortalUrl(portalUrl: string): string | null {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(portalUrl);
  } catch {
    return null;
  }

  const isLocalHttp =
    parsedUrl.protocol === 'http:' &&
    (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1');

  if (parsedUrl.protocol !== 'https:' && !isLocalHttp) {
    return null;
  }

  return parsedUrl.toString();
}

async function requestBillingPortal(params: {
  returnUrl?: string;
}): Promise<PortalRequestResult> {
  const result = await requestPostJson({
    url: '/api/v1/stripe/create-portal',
    body: { returnUrl: params.returnUrl },
    schema: createPortalResponseSchema,
    fallbackMessage: 'Failed to open billing portal',
    timeoutMs: PORTAL_TIMEOUT_MS,
    mapSchemaError: (issue) => {
      if (issue.path?.[0] === 'portalUrl') {
        return issue.message;
      }

      return undefined;
    },
  });

  if (result.kind === 'error') {
    const message = result.message;
    const timedOut = message === 'Request timed out — please try again';

    return {
      kind: 'error',
      message,
      error: result.error,
      reason: timedOut
        ? 'timeout'
        : message === 'Invalid billing portal response' ||
            message.includes('portalUrl')
          ? 'invalid-response'
          : 'network',
    };
  }

  const portalUrl = normalizePortalUrl(result.data.portalUrl);
  if (portalUrl === null) {
    return {
      kind: 'error',
      message: 'Billing portal returned an invalid redirect URL',
      error: new Error('Portal URL must use the https protocol'),
      reason: 'invalid-url',
    };
  }

  return {
    kind: 'success',
    portalUrl,
  };
}

export default function ManageSubscriptionButton({
  label = 'Manage Subscription',
  className,
  returnUrl,
  canOpenBillingPortal,
}: ManageSubscriptionButtonProps): ReactElement {
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef(false);

  async function handleClick() {
    if (!canOpenBillingPortal || pendingRef.current) {
      return;
    }

    pendingRef.current = true;
    setLoading(true);

    let isRedirecting = false;

    try {
      const result = await requestBillingPortal({ returnUrl });
      if (result.kind === 'error') {
        if (result.reason === 'timeout') {
          clientLogger.warn('Billing portal request timed out', {
            returnUrl,
          });
        } else {
          clientLogger.error('Failed to open billing portal', {
            error: result.error,
            returnUrl,
          });
        }

        toast.error('Unable to open billing portal', {
          description: result.message,
        });
        return;
      }

      try {
        window.location.href = result.portalUrl;
        isRedirecting = true;
      } catch (error: unknown) {
        clientLogger.error('Unexpected billing portal failure', {
          error,
          returnUrl,
        });
        toast.error('Unable to open billing portal', {
          description: getClientErrorMessage(error, 'Something went wrong'),
        });
      }
    } finally {
      pendingRef.current = false;

      if (!isRedirecting) {
        setLoading(false);
      }
    }
  }

  return (
    <Button
      className={className}
      disabled={loading || !canOpenBillingPortal}
      onClick={() => {
        void handleClick();
      }}
    >
      {loading ? 'Opening…' : label}
    </Button>
  );
}
