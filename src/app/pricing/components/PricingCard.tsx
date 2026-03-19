import { Check } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export interface PricingCardProps {
  name: string;
  price: string;
  intervalLabel: string;
  description: string;
  features: string[];
  badge?: string;
  cta: ReactNode;
  isPopular?: boolean;
  className?: string;
}

export function PricingCard({
  name,
  price,
  intervalLabel,
  description,
  features,
  badge,
  cta,
  isPopular = false,
  className,
}: PricingCardProps): ReactElement {
  return (
    <Card
      className={cn(
        'relative gap-0 overflow-hidden p-6 backdrop-blur-xl transition',
        isPopular
          ? 'ring-primary/50 border-primary/40 shadow-primary/25 dark:border-primary/30 dark:bg-primary/5 dark:ring-primary/70 dark:shadow-primary/20 bg-white/40 shadow-[0_0_24px_-4px] ring-1'
          : 'border-white/40 bg-white/30 shadow-lg dark:border-white/10 dark:bg-stone-900/30',
        className
      )}
    >
      {isPopular && (
        <div className="gradient-glow absolute -top-12 -right-12 h-32 w-32 opacity-30" />
      )}
      <CardHeader className="relative gap-1 p-0">
        {badge && (
          <div className="mb-4">
            <Badge
              variant={isPopular ? 'default' : 'secondary'}
              className={cn(
                'px-3 py-1 font-semibold',
                isPopular && 'brand-fill border-transparent text-white'
              )}
            >
              {badge}
            </Badge>
          </div>
        )}
        <CardTitle className="text-xl font-bold">{name}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        <div className="mt-6 flex items-baseline gap-1">
          <span className="text-4xl font-bold tracking-tight">{price}</span>
          <span className="text-muted-foreground text-sm">{intervalLabel}</span>
        </div>

        <div className="mt-6">{cta}</div>

        <Separator className="my-6" />

        <ul className="flex-1 space-y-3">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-3 text-sm">
              <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
