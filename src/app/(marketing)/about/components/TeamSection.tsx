import type { JSX } from 'react';

import { MarketingSectionLayout } from './MarketingSectionLayout';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { User } from 'lucide-react';
import { useId } from 'react';

export function TeamSection(): JSX.Element {
  const headingId = useId();

  return (
    <MarketingSectionLayout
      headingId={headingId}
      title={
        <>
          The <span className='gradient-text'>Team</span>
        </>
      }
      subtitle='A small, focused team obsessed with making learning effortless.'
    >
      <div className='mx-auto grid max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-4'>
        {TEAM_MEMBERS.map((member) => (
          <Card
            key={member.name}
            className='group relative overflow-hidden rounded-3xl border border-white/50 bg-white/40 p-8 text-center shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-white/10 dark:bg-card/40'
          >
            <div
              className='gradient-glow absolute -top-12 -right-12 size-32 opacity-30'
              aria-hidden='true'
            />

            <Avatar className='brand-fill-interactive mx-auto mb-4 size-16 shadow-lg'>
              <AvatarFallback className='bg-transparent'>
                <User className='size-7 text-white' aria-hidden='true' />
              </AvatarFallback>
            </Avatar>
            <h3 className='mb-1 font-semibold text-foreground'>
              {member.name}
            </h3>
            <p className='text-sm text-muted-foreground'>{member.role}</p>
          </Card>
        ))}
      </div>
    </MarketingSectionLayout>
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
