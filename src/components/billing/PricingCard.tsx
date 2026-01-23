import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { type ReactNode } from 'react';

export interface PricingCardProps {
  name: string;
  price: string;
  intervalLabel: string;
  features: string[];
  badge?: {
    label: string;
    variant?: 'default' | 'secondary';
  };
  cta: ReactNode;
  isPopular?: boolean;
  className?: string;
}

export function PricingCard({
  name,
  price,
  intervalLabel,
  features,
  badge,
  cta,
  isPopular = false,
  className,
}: PricingCardProps) {
  return (
    <Card
      className={cn(
        'relative flex min-h-[400px] flex-col justify-between p-6',
        className
      )}
    >
      {isPopular && (
        <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-1/2 transform">
          <Badge className="border-primary bg-primary text-primary-foreground rounded-full border-2 px-3 py-1 text-xs font-bold">
            Most Popular
          </Badge>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{name}</h2>
        {badge && (
          <Badge variant={badge.variant ?? 'default'}>{badge.label}</Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col items-start">
        <p className="mb-4 text-3xl font-bold">
          {price} {intervalLabel}
        </p>
        <ul className="text-muted-foreground mb-6 space-y-2 text-sm">
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </div>
      <div className="w-full px-12">{cta}</div>
    </Card>
  );
}
