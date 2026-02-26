import type { JSX } from 'react';
import type { Metadata } from 'next';

import { IntegrationGrid, RequestIntegration } from './components';

export const metadata: Metadata = {
  title: 'Integrations | Atlaris',
  description:
    'Connect Atlaris with tools like Google Calendar and export learning schedules with ease.',
};

export default function Page(): JSX.Element {
  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1>Integrations</h1>
        <p className="subtitle">
          Connect your favorite tools to supercharge your learning workflow
        </p>
      </header>

      <IntegrationGrid />

      <div className="mt-10">
        <RequestIntegration />
      </div>
    </div>
  );
}
