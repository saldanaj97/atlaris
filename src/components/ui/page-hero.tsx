import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

import { HorizonArc } from '@/components/ui/horizon-arc';
import { SectionOverline } from '@/components/ui/section-overline';
import { cn } from '@/lib/utils';

export interface PageHeroProps extends Omit<
  ComponentPropsWithoutRef<'header'>,
  'title'
> {
  as?: ElementType;
  backdropClassName?: string;
  contentClassName?: string;
  overline?: ReactNode;
  overlineIcon?: ReactNode;
  overlineClassName?: string;
  title?: ReactNode;
  titleId?: string;
  titleClassName?: string;
  description?: ReactNode;
  descriptionClassName?: string;
  actions?: ReactNode;
}

export function PageHero({
  as: Comp = 'header',
  backdropClassName,
  contentClassName,
  overline,
  overlineIcon,
  overlineClassName,
  title,
  titleId,
  titleClassName,
  description,
  descriptionClassName,
  actions,
  children,
  className,
  ...props
}: PageHeroProps) {
  const hasChrome =
    overline != null || title != null || description != null || actions != null;

  return (
    <Comp
      data-slot='page-hero'
      className={cn('relative isolate overflow-hidden', className)}
      {...props}
    >
      <HorizonArc className={backdropClassName} />
      {hasChrome ? (
        <div className={cn('relative z-10', contentClassName)}>
          {overline != null ? (
            <SectionOverline icon={overlineIcon} className={overlineClassName}>
              {overline}
            </SectionOverline>
          ) : null}
          {title != null ? (
            <h1 id={titleId} className={titleClassName}>
              {title}
            </h1>
          ) : null}
          {description != null ? (
            <p className={descriptionClassName}>{description}</p>
          ) : null}
          {actions}
          {children}
        </div>
      ) : (
        children
      )}
    </Comp>
  );
}
