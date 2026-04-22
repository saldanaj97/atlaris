'use client';

import { Menu, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet';
import type { NavItem } from '@/features/navigation';
import { trackEvent } from '@/lib/analytics';

import BrandLogo from '../BrandLogo';

interface MobileNavigationProps {
	navItems: NavItem[];
}

/**
 * Mobile navigation component with left-sliding sheet.
 */
export default function MobileNavigation({ navItems }: MobileNavigationProps) {
	const [open, setOpen] = useState(false);
	const pathname = usePathname();

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			{/* Hamburger trigger */}
			<Button
				variant="ghost"
				size="icon"
				onClick={() => setOpen(true)}
				className="text-muted-foreground h-9 w-9 rounded-xl bg-white/40 shadow-sm backdrop-blur-sm transition hover:bg-white/60 dark:bg-white/10 dark:hover:bg-white/20"
				aria-label="Open menu"
			>
				<Menu className="h-5 w-5" />
			</Button>

			{/* Sheet content sliding from left */}
			<SheetContent
				side="left"
				className="dark:bg-card/90 w-72 border-r border-white/40 bg-white/80 p-0 backdrop-blur-xl dark:border-white/10"
			>
				<SheetHeader className="p-6">
					<BrandLogo size="sm" onClick={() => setOpen(false)} />
					<SheetTitle className="sr-only">Navigation Menu</SheetTitle>
				</SheetHeader>

				{/* Navigation items */}
				<nav
					className="flex flex-1 flex-col gap-2 px-4"
					aria-label="Mobile navigation"
				>
					{/* Create New Plan - Primary Action */}
					<Button
						asChild
						variant="default"
						className="mb-2 h-auto w-full rounded-xl py-3 shadow-md hover:shadow-lg"
					>
						<Link
							href="/plans/new"
							onClick={() => {
								trackEvent({
									event: 'cta_click',
									label: 'Create New Plan',
									location: 'nav',
								});
								setOpen(false);
							}}
						>
							<Plus className="h-4 w-4" />
							Create New Plan
						</Link>
					</Button>

					{navItems.map((item) => {
						const isActive =
							item.href === '/'
								? pathname === '/'
								: pathname === item.href ||
									pathname.startsWith(`${item.href}/`);
						return (
							<div key={item.href} className="flex flex-col gap-1">
								<Link
									href={item.href}
									onClick={() => setOpen(false)}
									aria-current={isActive ? 'page' : undefined}
									className={`rounded-xl px-4 py-3 text-sm font-medium transition-all ${
										isActive
											? 'bg-primary text-white shadow-md'
											: 'text-muted-foreground hover:text-primary dark:hover:text-primary hover:bg-white/60 dark:hover:bg-white/10'
									}`}
								>
									{item.label}
								</Link>
								{item.dropdown && (
									<div className="border-primary/20 dark:border-primary/30 ml-4 flex flex-col gap-1 border-l pl-4">
										{item.dropdown.map((subItem) => {
											const isSubActive = pathname === subItem.href;
											return (
												<Link
													key={subItem.href}
													href={subItem.href}
													onClick={() => setOpen(false)}
													aria-current={isSubActive ? 'page' : undefined}
													className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
														isSubActive
															? 'text-primary dark:text-primary'
															: 'text-muted-foreground hover:text-primary dark:hover:text-primary'
													}`}
												>
													{subItem.label}
												</Link>
											);
										})}
									</div>
								)}
							</div>
						);
					})}
				</nav>
			</SheetContent>
		</Sheet>
	);
}
