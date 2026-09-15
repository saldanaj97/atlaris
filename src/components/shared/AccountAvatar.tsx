import { getAccountInitials } from '@/components/shared/account-initials';
import { cn } from '@/lib/utils';
import Image from 'next/image';

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
