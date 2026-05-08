import { vercelAdapter } from '@flags-sdk/vercel';
import { flag } from 'flags/next';

export const maintenanceMode = flag<boolean>({
  key: 'maintenance-mode',
  adapter: vercelAdapter(),
  description: 'Route all app traffic to the maintenance page.',
  options: [
    { value: false, label: 'Available' },
    { value: true, label: 'Maintenance mode' },
  ],
});
