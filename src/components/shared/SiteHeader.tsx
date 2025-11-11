import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/nextjs';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { getEffectiveClerkUserId } from '@/lib/api/auth';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { getUsageSummary } from '@/lib/stripe/usage';
import { getSubscriptionTier } from '@/lib/stripe/subscriptions';

export default async function SiteHeader() {
  const clerkUserId = await getEffectiveClerkUserId();

  let headerRight = (
    <div className="flex items-center space-x-4">
      <SignedOut>
        <SignInButton>
          <button className="text-ceramic-white bg-ceramic-black/50 hover:bg-ceramic-black/70 h-10 cursor-pointer rounded-full px-4 text-sm font-medium sm:h-12 sm:px-5 sm:text-base">
            Sign In
          </button>
        </SignInButton>
        <SignUpButton>
          <button className="text-ceramic-white h-10 cursor-pointer rounded-full bg-[#6c47ff] px-4 text-sm font-medium sm:h-12 sm:px-5 sm:text-base">
            Sign Up
          </button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </div>
  );

  if (clerkUserId) {
    const dbUser = await getUserByClerkId(clerkUserId);
    if (dbUser) {
      const [usage, sub] = await Promise.all([
        getUsageSummary(dbUser.id),
        getSubscriptionTier(dbUser.id),
      ]);

      const plansLimitLabel =
        usage.activePlans.limit === Infinity
          ? '∞'
          : String(usage.activePlans.limit);

      headerRight = (
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-3 md:flex">
            <Badge>{usage.tier.toUpperCase()}</Badge>
            {sub.subscriptionStatus ? (
              <Badge variant="neutral">{sub.subscriptionStatus}</Badge>
            ) : null}
            <div className="text-muted-foreground text-xs">
              <div>
                Plans {usage.activePlans.current}/{plansLimitLabel}
              </div>
              <div>
                Regens {usage.regenerations.used}/
                {usage.regenerations.limit === Infinity
                  ? '∞'
                  : usage.regenerations.limit}
              </div>
            </div>
            {usage.tier !== 'pro' ? (
              <Link
                href="/pricing"
                className="text-primary hover:text-primary/80 text-xs font-medium"
              >
                Upgrade
              </Link>
            ) : null}
          </div>
          <UserButton />
        </div>
      );
    }
  }

  return (
    <header className="container mx-auto px-6 py-4">
      <div className="flex h-16 flex-col items-center justify-between gap-4 md:flex-row">
        <Link href="/" className="flex items-center space-x-2">
          <BookOpen className="text-primary h-8 w-8" />
          <span className="text-2xl font-bold">Atlaris</span>
        </Link>
        {headerRight}
      </div>
    </header>
  );
}
