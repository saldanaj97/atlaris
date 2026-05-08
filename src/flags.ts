import { vercelAdapter } from '@flags-sdk/vercel';
import { flag } from 'flags/next';

const fallbackAdapter = () => ({
  decide: ({ defaultValue }: { defaultValue?: boolean }) =>
    defaultValue ?? false,
});

export const maintenanceMode = flag<boolean>({
  key: 'maintenance-mode',
  adapter: process.env.FLAGS ? vercelAdapter() : fallbackAdapter(),
  description: 'Route all app traffic to the maintenance page.',
  options: [
    { value: false, label: 'Available' },
    { value: true, label: 'Maintenance mode' },
  ],
});
