import { getMarketingCreatePlanCta } from '@/app/(landing)/_shared/marketing-create-plan-cta';
import { Landing } from '@/app/(landing)/landing/components/Landing';

export default async function LandingPage() {
  return <Landing createPlanCta={await getMarketingCreatePlanCta()} />;
}
