import { ROUTES } from '@/features/navigation/routes';
import { permanentRedirect } from 'next/navigation';

export default function Page(): never {
  permanentRedirect(ROUTES.LANDING);
}
