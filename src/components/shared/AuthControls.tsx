'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SubscriptionTier } from '@/lib/stripe/tier-limits';
import { UserButton } from '@neondatabase/auth/react';
import Link from 'next/link';
import type { ReactElement } from 'react';

interface AuthControlsProps {
  isAuthenticated: boolean;
  tier?: SubscriptionTier;
}

const tierVariants: Record<
  SubscriptionTier,
  'default' | 'secondary' | 'outline'
> = {
  free: 'outline',
  starter: 'secondary',
  pro: 'default',
};

export default function AuthControls({
  isAuthenticated,
  tier,
}: AuthControlsProps): ReactElement {
  return (
    <div className="flex items-center gap-2">
      {isAuthenticated ? (
        <div className="relative">
          <UserButton size="icon" />
          {tier && tier !== 'free' && (
            <Badge
              variant={tierVariants[tier]}
              className="pointer-events-none absolute -right-1.5 -bottom-1 hidden px-1 py-0 text-[10px] leading-tight capitalize lg:inline-flex"
            >
              {tier}
            </Badge>
          )}
        </div>
      ) : (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground hidden text-xs sm:inline-flex"
            asChild
          >
            <Link href="/auth/sign-in">Sign In</Link>
          </Button>
          <Button variant="default" size="sm" className="text-xs" asChild>
            <Link href="/auth/sign-up">Sign Up</Link>
          </Button>
        </>
      )}
    </div>
  );
}
