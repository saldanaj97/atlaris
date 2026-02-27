import type { Metadata } from 'next';

import { BellRing, BookOpen, Clock, CreditCard } from 'lucide-react';

import { Card } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Notifications',
  description: 'Manage your notification preferences.',
};

function DisabledToggle(): React.ReactElement {
  return (
    <div className="bg-muted h-5 w-9 rounded-full opacity-50">
      <div className="bg-muted-foreground/30 m-0.5 h-4 w-4 rounded-full" />
    </div>
  );
}

function ToggleRow({ label }: { label: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <DisabledToggle />
    </div>
  );
}

export default function NotificationsSettingsPage(): React.ReactElement {
  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1>Notifications</h1>
        <p className="subtitle">
          Manage how you stay informed about your learning progress and account
          activity
        </p>
      </header>

      {/* Coming soon banner */}
      <Card className="border-border bg-muted/50 mb-6 p-6">
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <BellRing className="text-primary h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">
              Personalized alerts are on the way
            </h2>
            <p className="text-muted-foreground text-sm">
              We&apos;re fine-tuning your notification experience. Soon
              you&apos;ll be able to customize exactly how and when you receive
              updates about your learning journey.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Learning Reminders */}
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-3">
            <Clock className="text-muted-foreground h-5 w-5" />
            <h2 className="text-xl font-semibold">Learning Reminders</h2>
          </div>
          <p className="text-muted-foreground mb-4 text-sm">
            Stay on track with daily and weekly nudges that keep your learning
            momentum going.
          </p>
          <div className="divide-border divide-y">
            <ToggleRow label="Daily study reminder" />
            <ToggleRow label="Weekly progress summary" />
            <ToggleRow label="Streak at risk" />
          </div>
        </Card>

        {/* Plan Updates */}
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-3">
            <BookOpen className="text-muted-foreground h-5 w-5" />
            <h2 className="text-xl font-semibold">Plan Updates</h2>
          </div>
          <p className="text-muted-foreground mb-4 text-sm">
            Get notified when your learning plans are ready and when new
            resources become available.
          </p>
          <div className="divide-border divide-y">
            <ToggleRow label="Plan generation complete" />
            <ToggleRow label="New resources available" />
            <ToggleRow label="Module milestones" />
          </div>
        </Card>

        {/* Account & Billing */}
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-3">
            <CreditCard className="text-muted-foreground h-5 w-5" />
            <h2 className="text-xl font-semibold">Account & Billing</h2>
          </div>
          <p className="text-muted-foreground mb-4 text-sm">
            Important notifications about your subscription, usage limits, and
            account security.
          </p>
          <div className="divide-border divide-y">
            <ToggleRow label="Subscription changes" />
            <ToggleRow label="Usage limit warnings" />
            <ToggleRow label="Security alerts" />
          </div>
        </Card>
      </div>
    </div>
  );
}
