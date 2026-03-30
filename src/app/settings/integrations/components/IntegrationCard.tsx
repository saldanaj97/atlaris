import { Check, Loader2 } from 'lucide-react';
import type { JSX } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type IntegrationStatus = 'available' | 'coming_soon' | 'connected';

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
        <Badge variant="secondary" role="status" aria-label="Available">
          Available
        </Badge>
      );
    case 'coming_soon':
      return (
        <Badge variant="outline" role="status" aria-label="Coming Soon">
          Coming Soon
        </Badge>
      );
    case 'connected':
      return (
        <Badge variant="default" role="status" aria-label="Connected">
          <span className="bg-success mr-1 inline-block h-2 w-2 rounded-full" />
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
        <Button variant="default" onClick={onConnect} disabled={isDisabled}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting…
            </>
          ) : (
            'Connect'
          )}
        </Button>
      );
    case 'coming_soon':
      return (
        <Button variant="outline" disabled>
          Coming Soon
        </Button>
      );
    case 'connected':
      return (
        <Button variant="outline" onClick={onDisconnect} disabled={isDisabled}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
      role="region"
      aria-label={name}
      className="dark:bg-card/40 relative overflow-hidden rounded-3xl border border-white/50 bg-white/40 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl dark:border-white/10"
    >
      <div className="gradient-glow absolute -top-12 -right-12 h-32 w-32 opacity-30" />

      <div className="relative flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="brand-fill-interactive inline-flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-lg">
              {icon}
            </div>
            <h3 className="text-lg font-semibold">{name}</h3>
          </div>
          <StatusBadge status={status} />
        </div>

        {/* Description */}
        <p className="text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>

        {/* Features */}
        <ul className="grid grid-cols-2 gap-2">
          {features.map((feature) => (
            <li
              key={feature}
              className="text-muted-foreground flex items-center gap-2 text-sm"
            >
              <Check className="text-success h-4 w-4 shrink-0" />
              {feature}
            </li>
          ))}
        </ul>

        {/* Action */}
        <div className="pt-2">
          <ActionButton
            status={status}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            loading={loading}
          />
        </div>
      </div>
    </Card>
  );
}
