import type {
  ResponsiveBackdropProps,
  ResponsiveBackdropSource,
} from '@/components/ui/responsive-backdrop';
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

import { ResponsiveBackdrop } from '@/components/ui/responsive-backdrop';
import { SectionOverline } from '@/components/ui/section-overline';
import { cn } from '@/lib/utils';

export type PageHeroArtwork = 'planetary-horizon' | 'mountain-overlook';

type PageHeroBackdrop = Pick<
  ResponsiveBackdropProps,
  'desktop' | 'mobile' | 'overlay'
>;

const artworkPresets: Record<PageHeroArtwork, PageHeroBackdrop> = {
  'planetary-horizon': {
    desktop: {
      src: '/artwork/planetary-horizon-desktop.jpg',
      objectPosition: '78% 50%',
      className: 'opacity-80',
    },
    mobile: {
      src: '/artwork/planetary-horizon-mobile.jpg',
      objectPosition: '68% 42%',
      className: 'opacity-75',
    },
  },
  'mountain-overlook': {
    desktop: {
      src: '/artwork/plan-library-mountain-overlook-desktop.jpg',
      objectPosition: '58% 50%',
    },
    mobile: {
      src: '/artwork/plan-library-mountain-overlook-mobile.jpg',
      objectPosition: '58% 50%',
    },
    overlay: 'background',
  },
};

export interface PageHeroProps extends Omit<
  ComponentPropsWithoutRef<'header'>,
  'title'
> {
  artwork?: PageHeroArtwork;
  as?: ElementType;
  overlay?: ResponsiveBackdropProps['overlay'];
  desktop?: Partial<ResponsiveBackdropSource>;
  mobile?: Partial<ResponsiveBackdropSource>;
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

function mergeBackdropSource(
  base: ResponsiveBackdropSource,
  override?: Partial<ResponsiveBackdropSource>,
): ResponsiveBackdropSource {
  return {
    src: override?.src ?? base.src,
    objectPosition: override?.objectPosition ?? base.objectPosition,
    className: cn(base.className, override?.className),
  };
}

/** Shared page introduction: artwork backdrop plus optional overline/title chrome. */
export function PageHero({
  artwork = 'planetary-horizon',
  as: Comp = 'header',
  overlay,
  desktop,
  mobile,
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
  const preset = artworkPresets[artwork];
  const hasChrome =
    overline != null || title != null || description != null || actions != null;

  return (
    <Comp
      data-slot='page-hero'
      className={cn('relative isolate overflow-hidden', className)}
      {...props}
    >
      <ResponsiveBackdrop
        desktop={mergeBackdropSource(preset.desktop, desktop)}
        mobile={mergeBackdropSource(preset.mobile, mobile)}
        overlay={overlay ?? preset.overlay}
        className={backdropClassName}
      />
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
