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
  userName?: string;
  userImageUrl?: string | null;
}

const tierVariants: Record<
  SubscriptionTier,
  'default' | 'secondary' | 'outline'
> = {
  free: 'outline',
  starter: 'secondary',
  pro: 'default',
};

function getInitials(name?: string): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
}

export default function AuthControls({
  isAuthenticated,
  tier,
  showClerkUserButton = true,
  userName,
  userImageUrl,
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
        <Tooltip>
          <TooltipTrigger asChild>
            <div className='relative inline-flex'>
              <Link
                href={`${ROUTES.SETTINGS.ROOT}#profile`}
                aria-label='Account'
                className='inline-flex size-9 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-foreground ring-1 ring-border transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
              >
                {userImageUrl ? (
                  // ponytail: plain img — Clerk CDN; next/image needs remotePatterns
                  // oxlint-disable-next-line eslint-plugin-next(no-img-element)
                  <img
                    src={userImageUrl}
                    alt=''
                    aria-hidden='true'
                    className='size-full object-cover'
                  />
                ) : (
                  <span aria-hidden='true'>{getInitials(userName)}</span>
                )}
              </Link>
              {tierBadge}
            </div>
          </TooltipTrigger>
          <TooltipContent side='bottom'>Account</TooltipContent>
        </Tooltip>
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
