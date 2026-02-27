import type { JSX } from 'react';

import { User } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';

/**
 * Team section with placeholder member cards.
 * TODO(#228): Replace with real team data
 */
export function TeamSection(): JSX.Element {
  return (
    <section className="relative py-24 lg:py-32" aria-labelledby="team-heading">
      <div className="relative z-10 mx-auto max-w-screen-xl px-6">
        <div className="mb-16 text-center">
          <h2 id="team-heading" className="text-foreground marketing-h2 mb-4">
            The <span className="gradient-text">Team</span>
          </h2>
          <p className="text-muted-foreground marketing-subtitle mx-auto max-w-2xl">
            A small, focused team obsessed with making learning effortless.
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM_MEMBERS.map((member) => (
            <Card
              key={member.name}
              className="group dark:bg-card/40 relative overflow-hidden rounded-3xl border border-white/50 bg-white/40 p-8 text-center shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl dark:border-white/10"
            >
              <div
                className="gradient-glow absolute -top-12 -right-12 h-32 w-32 opacity-30"
                aria-hidden="true"
              />

              <Avatar className="gradient-brand-interactive mx-auto mb-4 h-16 w-16 shadow-lg">
                <AvatarFallback className="bg-transparent">
                  <User className="h-7 w-7 text-white" aria-hidden="true" />
                </AvatarFallback>
              </Avatar>
              <h3 className="text-foreground mb-1 font-semibold">
                {member.name}
              </h3>
              <p className="text-muted-foreground text-sm">{member.role}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

interface TeamMember {
  name: string;
  role: string;
}

const TEAM_MEMBERS: TeamMember[] = [
  { name: 'Alex Rivera', role: 'Founder & CEO' },
  { name: 'Jordan Chen', role: 'Lead Engineer' },
  { name: 'Sam Patel', role: 'AI / ML' },
  { name: 'Taylor Kim', role: 'Design' },
];
