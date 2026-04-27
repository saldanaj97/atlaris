import { render, screen } from '@testing-library/react';
import { BookOpen } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { MetricCard } from '@/components/ui/metric-card';

describe('MetricCard', () => {
	it('renders label, value, and optional sublabel', () => {
		render(
			<MetricCard
				label="Progress"
				value="42%"
				sublabel="3 / 7 tasks"
				icon={<BookOpen data-testid="icon" aria-hidden />}
			/>,
		);
		expect(screen.getByText('Progress')).toBeInTheDocument();
		expect(screen.getByText('42%')).toBeInTheDocument();
		expect(screen.getByText('3 / 7 tasks')).toBeInTheDocument();
	});
});
