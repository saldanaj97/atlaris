'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { SubscriptionTier } from '@/shared/types/billing.types';
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
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative inline-flex">
              <UserButton size="icon" />
              {tier && tier !== 'free' && (
                <Badge
                  variant={tierVariants[tier]}
                  className="pointer-events-none absolute -right-1.5 -bottom-1 hidden px-1 py-0 text-[10px] leading-tight capitalize md:inline-flex"
                >
                  {tier}
                </Badge>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">Account</TooltipContent>
        </Tooltip>
      ) : (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-xs text-muted-foreground hover:text-foreground sm:inline-flex"
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
