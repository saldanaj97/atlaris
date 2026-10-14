'use client';

import { Button } from '@/components/ui/button';
import { SubscriptionDetailsButton } from '@clerk/nextjs/experimental';

/**
 * Opens Clerk's subscription details drawer (cancel, change, payment method)
 * directly from the settings billing surface.
 */
export function ManageSubscriptionButton({
  size = 'sm',
}: {
  size?: 'default' | 'sm';
}) {
  return (
    <SubscriptionDetailsButton>
      <Button type='button' variant='outline' size={size}>
        Manage or cancel subscription
      </Button>
    </SubscriptionDetailsButton>
  );
}
