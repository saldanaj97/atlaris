'use client';

interface ExportButtonsProps {
  planId: string;
}

// Temporarily disable export/sync controls in the UI while integrations are off.
// The underlying API routes and integration logic are covered separately by
// integration tests (currently skipped while this feature is disabled).
export function ExportButtons(_props: ExportButtonsProps) {
  return null;
}
