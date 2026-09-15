import { cn } from '@/lib/utils';
import * as React from 'react';

function Card({
  className,
  as: Comp = 'div',
  ...props
}: React.ComponentProps<'div'> & {
  as?: 'div' | 'section' | 'article' | 'aside';
}) {
  return (
    <Comp
      data-slot='card'
      className={cn(
        'flex min-w-0 flex-col gap-[24px] rounded-[12px] border border-border bg-panel py-[24px] text-panel-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-header'
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-[8px] px-[24px] has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto] [.border-b]:pb-[24px]',
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({
  className,
  as: TitleTag = 'div',
  ...props
}: React.ComponentProps<'div'> & {
  /** Use `h3` for section titles under a page `h2` (e.g. settings billing cards). */
  as?: 'div' | 'h2' | 'h3' | 'h4';
}) {
  return (
    <TitleTag
      data-slot='card-title'
      className={cn(
        'min-w-0 text-xl leading-[28px] font-semibold [overflow-wrap:anywhere]',
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-description'
      className={cn('text-sm leading-[22px] text-muted-foreground', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-action'
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-content'
      className={cn('min-w-0 px-[24px]', className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-footer'
      className={cn(
        'flex items-center px-[24px] [.border-t]:pt-[24px]',
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
