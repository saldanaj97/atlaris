import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { BellRing, BookOpen, Clock, CreditCard } from 'lucide-react';

import { ComingSoonAlert } from '@/components/shared/ComingSoonAlert';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Notifications',
  description: 'Manage your notification preferences.',
};

function DisabledToggle(): ReactElement {
  return (
    <div
      aria-hidden="true"
      className="bg-muted h-5 w-9 rounded-full opacity-50"
    >
      <div className="bg-muted-foreground/30 m-0.5 h-4 w-4 rounded-full" />
    </div>
  );
}

function ToggleRow({ label }: { label: string }): ReactElement {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <DisabledToggle />
    </div>
  );
}

export default function NotificationsSettingsPage(): ReactElement {
  return (
    <>
      <header className="mb-6">
        <h2 className="text-xl font-semibold">Notifications</h2>
        <p className="text-muted-foreground text-sm">
          Manage how you stay informed about your learning progress and account
          activity
        </p>
      </header>

      <ComingSoonAlert
        title="Personalized alerts are on the way"
        description="We're fine-tuning your notification experience. Soon you'll be able to customize exactly how and when you receive updates about your learning journey."
        icon={BellRing}
        className="mb-6"
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Learning Reminders */}
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-3">
            <Clock className="text-muted-foreground h-5 w-5" />
            <h3 className="text-xl font-semibold">Learning Reminders</h3>
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
            <h3 className="text-xl font-semibold">Plan Updates</h3>
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
            <h3 className="text-xl font-semibold">Account & Billing</h3>
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
    </>
  );
}
