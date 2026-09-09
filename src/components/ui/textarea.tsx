import { cn } from '@/lib/utils';
import * as React from 'react';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot='textarea'
      className={cn(
        'flex field-sizing-content min-h-[96px] w-full resize-y rounded-[8px] border border-input bg-card px-[12px] py-[8px] text-base leading-[24px] shadow-xs transition-[color,border-color,box-shadow] outline-none placeholder:text-muted-foreground hover:border-muted-foreground read-only:bg-secondary read-only:text-foreground focus-visible:border-ring focus-visible:ring-[2px] focus-visible:ring-ring focus-visible:ring-offset-[2px] focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled disabled:text-disabled-foreground disabled:opacity-100 aria-invalid:border-danger aria-invalid:hover:border-danger focus-visible:aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
