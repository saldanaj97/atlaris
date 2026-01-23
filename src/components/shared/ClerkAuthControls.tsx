'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SubscriptionTier } from '@/lib/stripe/tier-limits';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/nextjs';

interface ClerkAuthControlsProps {
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

export default function ClerkAuthControls({ tier }: ClerkAuthControlsProps) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-4">
      <SignedOut>
        {/* On mobile, show only Sign Up button to save space */}
        <SignInButton>
          <Button
            variant="secondary"
            size="sm"
            className="hidden text-xs sm:inline-flex"
          >
            Sign In
          </Button>
        </SignInButton>
        <SignUpButton>
          <Button variant="default" size="sm" className="text-xs">
            Sign Up
          </Button>
        </SignUpButton>
      </SignedOut>

      <SignedIn>
        {tier && (
          <Badge
            variant={tierVariants[tier]}
            className="hidden capitalize lg:inline-flex"
          >
            {tier}
          </Badge>
        )}
        <UserButton />
      </SignedIn>
    </div>
  );
}
