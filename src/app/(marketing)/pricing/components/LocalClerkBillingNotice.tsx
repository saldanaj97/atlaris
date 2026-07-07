import type { ReactElement } from 'react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';

export function LocalClerkBillingNotice(): ReactElement {
  return (
    <Alert className='max-w-2xl mx-auto'>
      <AlertTitle>Local product testing mode</AlertTitle>
      <AlertDescription>
        <p>
          Clerk Billing checkout is disabled while local product testing is
          active. Use the billing fixture to seed subscription state for your
          local user:
        </p>
        <p className='font-mono text-xs'>
          pnpm billing:clerk:fixture -- --user-id &lt;users.auth_user_id&gt;
          --plan pro
        </p>
      </AlertDescription>
    </Alert>
  );
}
