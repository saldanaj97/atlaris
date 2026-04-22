'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';
import AuthControls from '@/components/shared/AuthControls';
import BrandLogo from '@/components/shared/BrandLogo';
import MobileNavigation from '@/components/shared/nav/MobileNavigation';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import type { SubscriptionTier } from '@/features/billing/tier-limits';
import { type NavItem, ROUTES } from '@/features/navigation';

interface MobileHeaderProps {
	navItems: NavItem[];
	tier?: SubscriptionTier;
	isAuthenticated: boolean;
}

/**
 * Mobile header bar component (visible on mobile/tablet, hidden on desktop).
 *
 * Layout: hamburger (left) | title (center) | auth controls (right)
 */
export default function MobileHeader({
	navItems,
	tier,
	isAuthenticated,
}: MobileHeaderProps): JSX.Element {
	return (
		<div className="dark:bg-card/50 relative grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded-2xl border border-white/40 bg-black/5 px-3 py-2 shadow-lg backdrop-blur-xl sm:px-4 sm:py-2.5 lg:hidden dark:border-white/10">
			{/* Left: hamburger */}
			<div className="flex shrink-0">
				<MobileNavigation navItems={navItems} />
			</div>

			{/* Center: placeholder to maintain grid structure */}
			<div className="flex min-w-0 items-center justify-center overflow-hidden" />

			{/* Brand logo - absolutely positioned for true centering */}
			<div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center">
				<div className="pointer-events-auto">
					<BrandLogo size="sm" />
				</div>
			</div>

			{/* Right: new plan + theme toggle + user/auth */}
			<div className="flex min-w-0 shrink-0 items-center gap-1">
				<Button
					asChild
					variant="ghost"
					size="icon-sm"
					className="text-muted-foreground hover:text-foreground shrink-0"
				>
					<Link
						href={isAuthenticated ? ROUTES.PLANS.NEW : ROUTES.AUTH.SIGN_IN}
						aria-label={isAuthenticated ? 'Create new plan' : 'Sign in'}
					>
						<Plus className="h-4 w-4" />
					</Link>
				</Button>
				<div className="shrink-0">
					<ThemeToggle size="icon-sm" />
				</div>
				<div className="min-w-0 shrink-0">
					<AuthControls
						isAuthenticated={isAuthenticated}
						tier={isAuthenticated ? tier : undefined}
					/>
				</div>
			</div>
		</div>
	);
}
