import { cn } from '@/lib/utils';
import * as React from 'react';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot='input'
      className={cn(
        'min-h-[40px] w-full min-w-0 rounded-[8px] border border-input bg-card px-[12px] py-[8px] text-base leading-[24px] shadow-xs transition-[color,border-color,box-shadow] outline-none selection:bg-action-primary selection:text-action-primary-foreground file:inline-flex file:h-[28px] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-foreground read-only:bg-muted read-only:text-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled disabled:text-disabled-foreground disabled:opacity-100 [@media(pointer:coarse)]:min-h-[44px]',
        'focus-visible:border-ring focus-visible:ring-[2px] focus-visible:ring-ring focus-visible:ring-offset-[2px] focus-visible:ring-offset-background',
        'aria-invalid:border-danger aria-invalid:ring-[2px] aria-invalid:ring-danger aria-invalid:hover:border-danger',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
