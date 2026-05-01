import type { JSX } from 'react';

import {
  IntegrationGrid,
  RequestIntegration,
} from '@/app/(app)/settings/integrations/components';
import { PageHeader } from '@/components/ui/page-header';

/**
 * Settings → Integrations sub-page.
 *
 * Rendered inside the shared settings layout.
 * Displays the integration management UI within Settings.
 */
export default function SettingsIntegrationsPage(): JSX.Element {
  return (
    <>
      <PageHeader
        title="Integrations"
        titleAs="h2"
        subtitle="Connect your favorite tools to supercharge your learning workflow"
      />

      <IntegrationGrid />

      <div className="mt-10">
        <RequestIntegration />
      </div>
    </>
  );
}
