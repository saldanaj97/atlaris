import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Product app page outer wrapper: max width, horizontal padding, vertical rhythm.
 */
function PageShell({
	className,
	fullHeight = true,
	children,
	...props
}: React.ComponentProps<'div'> & {
	/** When true, ensures at least viewport height (typical app pages). */
	fullHeight?: boolean;
}) {
	return (
		<div
			data-slot="page-shell"
			className={cn(
				'mx-auto max-w-7xl px-6 py-8',
				fullHeight && 'min-h-screen',
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

export { PageShell };
