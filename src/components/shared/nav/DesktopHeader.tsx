'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { JSX } from 'react';
import AuthControls from '@/components/shared/AuthControls';
import BrandLogo from '@/components/shared/BrandLogo';
import DesktopNavigation from '@/components/shared/nav/DesktopNavigation';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { SubscriptionTier } from '@/features/billing/tier-limits';
import { type NavItem, ROUTES } from '@/features/navigation';
import { trackEvent } from '@/lib/analytics';
import { cn } from '@/lib/utils';

interface DesktopHeaderProps {
	navItems: NavItem[];
	tier?: SubscriptionTier;
	isAuthenticated: boolean;
}

/**
 * Desktop header component (hidden on mobile/tablet, visible on desktop).
 *
 * Layout: brand (left) | navigation (center) | auth controls (right)
 */
export default function DesktopHeader({
	navItems,
	tier,
	isAuthenticated,
}: DesktopHeaderProps): JSX.Element {
	const pathname = usePathname();
	const isPricingPage = pathname === ROUTES.PRICING;

	return (
		<div
			className={cn(
				'dark:bg-card/50 hidden w-full grid-cols-3 items-center rounded-2xl border border-white/40 bg-black/5 px-5 py-2.5 shadow-lg backdrop-blur-xl lg:grid dark:border-white/10',
				isPricingPage &&
					'border border-white/25 bg-white/20 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-card/20',
			)}
		>
			{/* Brand (left) */}
			<div className="flex items-center">
				<BrandLogo />
			</div>

			{/* Navigation (center) */}
			<div className="flex justify-center">
				<DesktopNavigation navItems={navItems} />
			</div>

			{/* Auth controls (right) */}
			<div className="flex items-center justify-end gap-1">
				<Button
					variant="ghost"
					size="sm"
					className="text-muted-foreground hover:text-foreground gap-1.5"
					asChild
				>
					<Link
						href={isAuthenticated ? '/plans/new' : '/auth/sign-in'}
						onClick={() => {
							if (isAuthenticated) {
								trackEvent({
									event: 'cta_click',
									label: 'New Plan',
									location: 'nav',
								});
							}
						}}
					>
						<Plus className="h-3.5 w-3.5" />
						<span>New Plan</span>
					</Link>
				</Button>

				<ThemeToggle />

				<Separator orientation="vertical" className="mx-1 h-5" />

				<AuthControls
					isAuthenticated={isAuthenticated}
					tier={isAuthenticated ? tier : undefined}
				/>
			</div>
		</div>
	);
}
