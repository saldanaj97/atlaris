import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Check, Loader2 } from 'lucide-react';

type IntegrationStatus = 'available' | 'coming_soon' | 'connected';

export interface IntegrationCardProps {
  name: string;
  description: string;
  icon: string;
  status: IntegrationStatus;
  features: string[];
  onConnect?: () => void;
  onDisconnect?: () => void;
  loading?: boolean;
}

function StatusBadge({ status }: { status: IntegrationStatus }) {
  switch (status) {
    case 'available':
      return (
        <Badge variant='secondary' role='status' aria-label='Available'>
          Available
        </Badge>
      );
    case 'coming_soon':
      return (
        <Badge variant='outline' role='status' aria-label='Coming Soon'>
          Coming Soon
        </Badge>
      );
    case 'connected':
      return (
        <Badge variant='default' role='status' aria-label='Connected'>
          <span className='mr-1 inline-block size-2 rounded-full bg-success' />
          Connected
        </Badge>
      );
  }
}

function ActionButton({
  status,
  onConnect,
  onDisconnect,
  loading,
}: {
  status: IntegrationStatus;
  onConnect?: () => void;
  onDisconnect?: () => void;
  loading?: boolean;
}) {
  const isDisabled =
    loading ||
    (status === 'available' && onConnect == null) ||
    (status === 'connected' && onDisconnect == null);

  switch (status) {
    case 'available':
      return (
        <Button variant='default' onClick={onConnect} disabled={isDisabled}>
          {loading ? (
            <>
              <Loader2 className='mr-2 size-4 animate-spin motion-reduce:animate-none' />
              Connecting…
            </>
          ) : (
            'Connect'
          )}
        </Button>
      );
    case 'coming_soon':
      return null;
    case 'connected':
      return (
        <Button variant='outline' onClick={onDisconnect} disabled={isDisabled}>
          {loading ? (
            <>
              <Loader2 className='mr-2 size-4 animate-spin motion-reduce:animate-none' />
              Disconnecting…
            </>
          ) : (
            'Disconnect'
          )}
        </Button>
      );
  }
}

export function IntegrationCard({
  name,
  description,
  icon,
  status,
  features,
  onConnect,
  onDisconnect,
  loading,
}: IntegrationCardProps) {
  return (
    <Card
      role='region'
      aria-label={name}
      className='flex flex-col gap-4 border-border bg-card py-5 shadow-sm sm:gap-6 sm:py-6'
    >
      <CardHeader className='px-5 sm:px-6'>
        <div className='flex items-center gap-3 sm:gap-4'>
          <div
            className='inline-flex size-11 items-center justify-center rounded-lg bg-primary/10 text-xl text-primary sm:size-14 sm:rounded-xl sm:text-2xl'
            aria-hidden='true'
          >
            {icon}
          </div>
          <CardTitle className='text-lg'>{name}</CardTitle>
        </div>
        <CardAction>
          <StatusBadge status={status} />
        </CardAction>
      </CardHeader>

      <CardContent className='flex flex-1 flex-col gap-4 px-5 sm:px-6'>
        <p className='text-sm leading-relaxed text-muted-foreground'>
          {description}
        </p>

        <ul className='grid gap-x-3 gap-y-2 sm:grid-cols-2'>
          {features.map((feature) => (
            <li
              key={feature}
              className='flex items-center gap-2 text-sm text-muted-foreground'
            >
              <Check className='size-4 shrink-0 text-success' aria-hidden />
              {feature}
            </li>
          ))}
        </ul>

        <div className='mt-auto pt-1'>
          <ActionButton
            status={status}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            loading={loading}
          />
        </div>
      </CardContent>
    </Card>
  );
}
