'use client';

import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ROUTES } from '@/features/navigation';
import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';

interface AuthControlsProps {
  isAuthenticated: boolean;
  tier?: SubscriptionTier;
  showClerkUserButton?: boolean;
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
  showClerkUserButton = true,
}: AuthControlsProps): ReactElement {
  const tierBadge =
    tier && tier !== 'free' ? (
      <Badge
        variant={tierVariants[tier]}
        className='pointer-events-none absolute -right-1.5 -bottom-1 hidden px-1 py-0 text-[10px] leading-tight capitalize md:inline-flex'
      >
        {tier}
      </Badge>
    ) : null;

  return (
    <div className='flex items-center gap-2'>
      {isAuthenticated && showClerkUserButton ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className='relative inline-flex'>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: 'size-9',
                  },
                }}
              />
              {tierBadge}
            </div>
          </TooltipTrigger>
          <TooltipContent side='bottom'>Account</TooltipContent>
        </Tooltip>
      ) : isAuthenticated ? (
        <div className='relative inline-flex'>
          <Button variant='ghost' size='sm' className='text-xs' asChild>
            <Link href={ROUTES.SETTINGS.PROFILE}>Account</Link>
          </Button>
          {tierBadge}
        </div>
      ) : (
        <>
          <Button
            variant='ghost'
            size='sm'
            className='hidden text-xs text-muted-foreground hover:text-foreground sm:inline-flex'
            asChild
          >
            <Link href='/auth/sign-in'>Sign In</Link>
          </Button>
          <Button variant='default' size='sm' className='text-xs' asChild>
            <Link href='/auth/sign-up'>Sign Up</Link>
          </Button>
        </>
      )}
    </div>
  );
}
