import type { JSX } from 'react';

import {
  IntegrationGrid,
  RequestIntegration,
} from '@/app/settings/integrations/components';

/**
 * Settings → Integrations sub-page.
 *
 * Rendered inside the shared settings layout.
 * Displays the same integration management UI that lives at /integrations.
 */
export default function SettingsIntegrationsPage(): JSX.Element {
  return (
    <>
      <header className="mb-6">
        <h2 className="text-xl font-semibold">Integrations</h2>
        <p className="text-muted-foreground text-sm">
          Connect your favorite tools to supercharge your learning workflow
        </p>
      </header>

      <IntegrationGrid />

      <div className="mt-10">
        <RequestIntegration />
      </div>
    </>
  );
}
