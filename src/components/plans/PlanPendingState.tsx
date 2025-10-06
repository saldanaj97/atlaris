'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { formatSkillLevel } from '@/lib/formatters';
import type { ClientPlanDetail } from '@/lib/types/client';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface PlanPendingStateProps {
  plan: ClientPlanDetail;
}

export function PlanPendingState({ plan }: PlanPendingStateProps) {
  const router = useRouter();
  const { status, attempts, error, isPolling } = usePlanStatus(
    plan.id,
    plan.status ?? 'pending'
  );

  // Auto-refresh when status becomes ready
  useEffect(() => {
    if (status === 'ready') {
      router.refresh();
    }
  }, [status, router]);

  const isPending = status === 'pending';
  const isProcessing = status === 'processing';
  const isFailed = status === 'failed';

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-card border-0 p-8 shadow-lg">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Badge variant="secondary" className="uppercase">
                {formatSkillLevel(plan.skillLevel)}
              </Badge>
              <Badge
                variant={
                  isFailed
                    ? 'destructive'
                    : isProcessing
                      ? 'default'
                      : 'outline'
                }
                className="ml-2 uppercase"
              >
                {status}
              </Badge>
            </div>
            {isPolling && (
              <Loader2 className="text-primary h-6 w-6 animate-spin" />
            )}
          </div>
          <CardTitle className="text-3xl font-bold">{plan.topic}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {isFailed && error ? (
            <div className="bg-destructive/10 border-destructive/20 flex items-start gap-3 rounded-lg border p-4">
              <AlertCircle className="text-destructive mt-0.5 h-5 w-5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-destructive font-semibold">
                  Generation Failed
                </p>
                <p className="text-muted-foreground text-sm">{error}</p>
                {attempts > 0 && (
                  <p className="text-muted-foreground text-sm">
                    Failed after {attempts} attempt{attempts !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
          ) : isProcessing ? (
            <div className="bg-primary/5 flex items-start gap-3 rounded-lg p-4">
              <Loader2 className="text-primary mt-0.5 h-5 w-5 flex-shrink-0 animate-spin" />
              <div className="space-y-1">
                <p className="font-semibold">Generating Your Learning Plan</p>
                <p className="text-muted-foreground text-sm">
                  Our AI is crafting personalized modules and tasks tailored to
                  your goals. This usually takes 5-10 seconds.
                </p>
                {attempts > 1 && (
                  <p className="text-muted-foreground text-sm">
                    Attempt {attempts}
                  </p>
                )}
              </div>
            </div>
          ) : isPending ? (
            <div className="bg-muted/50 flex items-start gap-3 rounded-lg p-4">
              <Loader2 className="text-muted-foreground mt-0.5 h-5 w-5 flex-shrink-0 animate-spin" />
              <div className="space-y-1">
                <p className="font-semibold">Queued for Generation</p>
                <p className="text-muted-foreground text-sm">
                  Your learning plan is queued and will begin generation
                  shortly.
                </p>
                {attempts > 0 && (
                  <p className="text-muted-foreground text-sm">
                    Position in queue: processing
                  </p>
                )}
              </div>
            </div>
          ) : null}

          <div className="border-t pt-4">
            <h3 className="mb-2 font-semibold">Plan Details</h3>
            <div className="text-muted-foreground grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="font-medium">Skill Level:</span>{' '}
                {formatSkillLevel(plan.skillLevel)}
              </div>
              <div>
                <span className="font-medium">Weekly Hours:</span>{' '}
                {plan.weeklyHours}
              </div>
              <div>
                <span className="font-medium">Learning Style:</span>{' '}
                {plan.learningStyle}
              </div>
              <div>
                <span className="font-medium">Origin:</span> {plan.origin}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="text-muted-foreground p-6 text-center">
        <p>
          Once generation is complete, your personalized learning modules and
          tasks will appear here.
        </p>
      </Card>
    </div>
  );
}
