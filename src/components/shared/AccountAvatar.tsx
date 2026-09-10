import { cn } from '@/lib/utils';
import Image from 'next/image';

export function getAccountInitials(name?: string): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
}

export function AccountAvatar({
  userName,
  userImageUrl,
  className,
}: {
  userName?: string;
  userImageUrl?: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden='true'
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-foreground ring-1 ring-border',
        className,
      )}
    >
      {userImageUrl ? (
        <Image
          src={userImageUrl}
          alt=''
          width={36}
          height={36}
          unoptimized
          className='size-full object-cover'
        />
      ) : (
        <span>{getAccountInitials(userName)}</span>
      )}
    </span>
  );
}
