import type { ReactNode } from 'react';

import {
  marketingGlassCardPopularSurface,
  marketingGlassCardSurface,
} from '@/app/(marketing)/_shared/marketing-glass-surface';
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
import { Check } from 'lucide-react';

interface PricingCardProps {
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
}: PricingCardProps) {
  return (
    <Card
      className={cn(
        'relative gap-0 overflow-hidden p-6 transition-[transform,box-shadow] motion-reduce:transition-none',
        isPopular
          ? marketingGlassCardPopularSurface
          : marketingGlassCardSurface,
        className,
      )}
    >
      {isPopular && (
        <div className='gradient-glow absolute -top-12 -right-12 size-32 opacity-30' />
      )}
      <CardHeader className='relative gap-1 p-0'>
        {badge && (
          <div className='mb-4'>
            <Badge
              variant={isPopular ? 'default' : 'secondary'}
              className={cn(
                'px-3 py-1 font-semibold',
                isPopular && 'brand-fill border-transparent text-white',
              )}
            >
              {badge}
            </Badge>
          </div>
        )}
        <CardTitle className='text-xl font-bold'>{name}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className='p-0'>
        <div className='mt-6 flex items-baseline gap-1'>
          <span className='text-4xl font-bold tracking-tight'>{price}</span>
          <span className='text-sm text-muted-foreground'>{intervalLabel}</span>
        </div>

        <div className='mt-6'>{cta}</div>

        <Separator className='my-6' />

        <ul className='flex-1 space-y-3'>
          {features.map((feature) => (
            <li key={feature} className='flex items-start gap-3 text-sm'>
              <Check className='mt-0.5 size-4 shrink-0 text-primary' />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
