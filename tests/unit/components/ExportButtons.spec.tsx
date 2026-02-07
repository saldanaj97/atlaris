import { ExportButtons } from '@/app/plans/[id]/components/ExportButtons';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('ExportButtons', () => {
  it('renders nothing while export feature is disabled', () => {
    const { container } = render(<ExportButtons planId="test-plan-123" />);

    expect(container.firstChild).toBeNull();
  });
});
