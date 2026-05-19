import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface GradientProgressHeroFrameProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  gradientClassName: string;
  completion: number;
}

export function GradientProgressHeroFrame({
  children,
  className,
  contentClassName,
  gradientClassName,
  completion,
}: GradientProgressHeroFrameProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-3xl bg-linear-to-br p-8 shadow-2xl',
        gradientClassName,
        className,
      )}
    >
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOGMzLjA5IDAgNi0uNzc4IDguNTQzLTIuMTQ3QzUzLjA1MSA0Ny41OCA1OCA0MC40MTYgNTggMzJjMC04LjI4NC02LjcxNi0xNS0xNS0xNS0xLjU5MyAwLTMuMTI4LjI0OC00LjU3My43MDlDMzcuMjkgMTguMjQ5IDM2LjY1MiAxOCAzNiAxOHoiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIiBzdHJva2Utd2lkdGg9IjEiLz48L2c+PC9zdmc+')] opacity-30" />

      <div
        className={cn(
          'relative z-10 flex flex-col justify-between',
          contentClassName,
        )}
      >
        {children}
      </div>

      <div className="absolute right-0 bottom-0 left-0 h-1 bg-black/20">
        <div
          className="h-full bg-white transition-all duration-500"
          style={{ width: `${completion}%` }}
        />
      </div>
    </div>
  );
}
