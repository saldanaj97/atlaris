import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Product page title row: uses app `h1`/`h2` base scale from globals; optional subtitle and actions.
 */
function PageHeader({
	className,
	title,
	subtitle,
	actions,
	titleAs: TitleTag = 'h1',
	...props
}: React.ComponentProps<'div'> & {
	title: React.ReactNode;
	subtitle?: React.ReactNode;
	actions?: React.ReactNode;
	/** Use `h2` for nested pages under a parent title (e.g. settings sub-routes). */
	titleAs?: 'h1' | 'h2';
}) {
	return (
		<header
			data-slot="page-header"
			className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}
			{...props}
		>
			<div className="min-w-0 flex-1">
				<TitleTag>{title}</TitleTag>
			{subtitle != null ? (
				typeof subtitle === 'string' ? (
					<p className="subtitle mt-1">{subtitle}</p>
				) : (
					<div className="text-muted-foreground mt-1 text-sm">{subtitle}</div>
				)
			) : null}
			</div>
			{actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
		</header>
	);
}

export { PageHeader };
