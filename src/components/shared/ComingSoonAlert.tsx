import type { LucideIcon } from 'lucide-react';
import { Sparkles } from 'lucide-react';
import type { JSX } from 'react';

import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/utils';

interface ComingSoonAlertProps {
	/** Heading text displayed in the alert */
	title: string;
	/** Supporting copy explaining what's coming */
	description: string;
	/** Leading icon – defaults to Sparkles */
	icon?: LucideIcon;
	/** Extra Tailwind classes forwarded to the root element */
	className?: string;
}

export function ComingSoonAlert({
	title,
	description,
	icon: Icon = Sparkles,
	className,
}: ComingSoonAlertProps): JSX.Element {
	return (
		<Surface
			variant="muted"
			padding="comfortable"
			role="region"
			aria-label="Coming soon"
			className={cn('flex items-start gap-4', className)}
		>
			<div className="border-panel-border bg-panel text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-none">
				<Icon className="h-4 w-4" aria-hidden="true" />
			</div>
			<div className="min-w-0 space-y-0.5">
				<p className="text-foreground text-sm font-medium">{title}</p>
				<p className="text-muted-foreground text-sm leading-relaxed">
					{description}
				</p>
			</div>
		</Surface>
	);
}
