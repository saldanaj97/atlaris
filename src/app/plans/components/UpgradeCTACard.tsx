import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function UpgradeCTACard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/60 shadow-lg backdrop-blur-sm">
      <div className="p-5">
        <h3 className="mb-2 text-lg font-semibold">Upgrade for more</h3>
        <p className="text-muted-foreground mb-4 text-sm">
          You&apos;ve reached your current plan limits. Upgrade to unlock more
          capacity and features.
        </p>
        <Button asChild className="w-full">
          <Link href="/pricing">View Plans</Link>
        </Button>
      </div>
    </div>
  );
}
