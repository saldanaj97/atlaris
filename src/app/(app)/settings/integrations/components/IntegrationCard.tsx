import type { JSX } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      return (
        <Button variant='outline' disabled>
          Coming Soon
        </Button>
      );
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
}: IntegrationCardProps): JSX.Element {
  return (
    <Card
      role='region'
      aria-label={name}
      className='flex flex-col border-border bg-card shadow-sm'
    >
      <CardHeader className='flex-row items-start justify-between space-y-0'>
        <div className='flex items-center gap-4'>
          <div className='inline-flex size-14 items-center justify-center rounded-xl bg-primary/10 text-2xl text-primary'>
            {icon}
          </div>
          <CardTitle className='text-lg'>{name}</CardTitle>
        </div>
        <StatusBadge status={status} />
      </CardHeader>

      <CardContent className='flex flex-1 flex-col gap-5'>
        <p className='text-sm leading-relaxed text-muted-foreground'>
          {description}
        </p>

        <ul className='grid grid-cols-2 gap-2'>
          {features.map((feature) => (
            <li
              key={feature}
              className='flex items-center gap-2 text-sm text-muted-foreground'
            >
              <Check className='size-4 shrink-0 text-success' />
              {feature}
            </li>
          ))}
        </ul>

        <div className='pt-2'>
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
