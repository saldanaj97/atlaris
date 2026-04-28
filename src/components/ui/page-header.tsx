import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Product page title row: centralizes app title/subtitle scale so pages do not improvise typography.
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
	const titleClassName =
		TitleTag === 'h2' ? 'product-page-title-nested' : 'product-page-title';

	return (
		<header
			data-slot="page-header"
			className={cn(
				'mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
				className,
			)}
			{...props}
		>
			<div className="min-w-0 flex-1">
				<TitleTag className={titleClassName}>{title}</TitleTag>
				{subtitle != null ? (
					typeof subtitle === 'string' ? (
						<p className="product-page-subtitle mt-1">{subtitle}</p>
					) : (
						<div className="product-page-subtitle mt-1">{subtitle}</div>
					)
				) : null}
			</div>
			{actions ? (
				<div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
			) : null}
		</header>
	);
}

export { PageHeader };
