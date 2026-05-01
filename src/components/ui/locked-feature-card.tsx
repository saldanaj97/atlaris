'use client';

import { Lock } from 'lucide-react';
import type { JSX, ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export interface LockedFeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  className?: string;
}

/**
 * Preview tile for unreleased analytics/features: readable copy, lock affordance,
 * dashed edge — avoids washing entire card with opacity.
 */
export function LockedFeatureCard({
  icon,
  title,
  description,
  className,
}: LockedFeatureCardProps): JSX.Element {
  return (
    <Card
      data-slot="locked-feature-card"
      role="group"
      aria-label={`Preview — ${title}, unavailable`}
      className={cn(
        'border-dashed border-border/80 bg-card shadow-sm',
        className,
      )}
    >
      <CardContent className="relative">
        <div className="absolute top-4 right-4" aria-hidden="true">
          <Lock className="h-4 w-4 text-muted-foreground" />
        </div>

        <div className="flex flex-col gap-3 pr-8">
          <span className="shrink-0" aria-hidden="true">
            {icon}
          </span>
          <div>
            <h3 className="font-medium text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        <Progress
          value={0}
          className="mt-4 h-1.5 bg-muted"
          aria-hidden="true"
        />
      </CardContent>
    </Card>
  );
}
