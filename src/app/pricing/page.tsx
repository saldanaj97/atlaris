import ManageSubscriptionButton from '@/components/billing/ManageSubscriptionButton';
import MonthlyPricingCards from '@/components/billing/MonthlyPricingCards';
import YearlyPricingCards from '@/components/billing/YearlyPricingCards';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function PricingPage() {
  return (
    <div className="container mx-auto flex min-h-screen flex-col items-center justify-start gap-y-4 px-6 py-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Choose your plan</h1>
        <p className="text-muted-foreground">
          Upgrade for more capacity and features.
        </p>
      </div>

      <div className="w-full">
        <Tabs defaultValue="monthly">
          <div className="flex justify-center">
            <TabsList>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="yearly">Yearly</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="monthly">
            <MonthlyPricingCards />
          </TabsContent>
          <TabsContent value="yearly">
            <YearlyPricingCards />
          </TabsContent>
        </Tabs>
      </div>

      <div className="text-center">
        <p className="text-muted-foreground mb-4">
          Already subscribed? Manage your plan.
        </p>
        <ManageSubscriptionButton className="mx-auto w-full max-w-sm" />
      </div>
    </div>
  );
}
