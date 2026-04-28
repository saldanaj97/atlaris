import { BookOpen, Flame, Star, Target, Trophy, Zap } from 'lucide-react';
import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ComingSoonAlert } from '@/components/shared/ComingSoonAlert';
import { LockedFeatureCard } from '@/components/ui/locked-feature-card';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';

export const metadata: Metadata = {
	title: 'Achievements | Atlaris',
	description: 'Celebrate your learning milestones and unlock badges.',
	openGraph: {
		title: 'Achievements | Atlaris',
		description: 'Celebrate your learning milestones and unlock badges.',
		url: '/analytics/achievements',
		images: ['/og-default.jpg'],
	},
};

const iconClass = 'text-primary h-8 w-8 shrink-0';

const ACHIEVEMENTS = [
	{
		icon: <Trophy className={iconClass} aria-hidden />,
		name: 'First Steps',
		description:
			'Complete your first learning plan and kickstart your growth journey.',
	},
	{
		icon: <Flame className={iconClass} aria-hidden />,
		name: 'Streak Master',
		description:
			'Maintain a daily learning streak and build unstoppable momentum.',
	},
	{
		icon: <BookOpen className={iconClass} aria-hidden />,
		name: 'Knowledge Seeker',
		description:
			'Complete multiple modules and expand your expertise across topics.',
	},
	{
		icon: <Zap className={iconClass} aria-hidden />,
		name: 'Speed Learner',
		description:
			'Finish plans ahead of schedule and prove you thrive under pressure.',
	},
	{
		icon: <Star className={iconClass} aria-hidden />,
		name: 'Consistency King',
		description: 'Log regular weekly study sessions and make learning a habit.',
	},
	{
		icon: <Target className={iconClass} aria-hidden />,
		name: 'Goal Crusher',
		description:
			'Hit every learning target you set and master the art of follow-through.',
	},
];

export default function AchievementsPage(): JSX.Element {
	return (
		<PageShell>
			<PageHeader
				title="Achievements"
				subtitle="Celebrate every milestone on your learning journey"
			/>

			<ComingSoonAlert
				title="Your achievements are being crafted."
				description="Earn badges, track milestones, and showcase your progress — launching soon."
				icon={Trophy}
				className="mb-8"
			/>

			<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{ACHIEVEMENTS.map((achievement) => (
					<LockedFeatureCard
						key={achievement.name}
						icon={achievement.icon}
						title={achievement.name}
						description={achievement.description}
					/>
				))}
			</div>
		</PageShell>
	);
}
