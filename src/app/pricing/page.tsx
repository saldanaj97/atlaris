import ManageSubscriptionButton from '@/app/pricing/components/ManageSubscriptionButton';
import MonthlyPricingCards from '@/app/pricing/components/MonthlyPricingCards';
import YearlyPricingCards from '@/app/pricing/components/YearlyPricingCards';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing | Atlaris',
  description:
    'Compare Atlaris plans and choose the subscription that fits your learning goals.',
};

export default function PricingPage() {
  return (
    <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-start gap-y-10 overflow-hidden px-6 py-16">
      <div className="from-primary/30 to-accent/20 absolute -top-20 -left-32 h-96 w-96 rounded-full bg-linear-to-br opacity-40 blur-3xl dark:opacity-20" />
      <div className="absolute top-40 -right-32 h-80 w-80 rounded-full bg-linear-to-br from-cyan-200 to-blue-200 opacity-40 blur-3xl dark:opacity-15" />

      <div className="relative z-10 mb-5 text-center sm:mb-6">
        <h1 className="text-foreground mb-2 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
          Invest in your{' '}
          <span className="from-primary via-accent to-primary bg-linear-to-r bg-clip-text text-transparent">
            growth
          </span>
        </h1>
        <p className="text-muted-foreground mx-auto max-w-md text-base sm:max-w-xl sm:text-lg">
          Choose the plan that matches your learning ambitions. Start free,
          upgrade when you&apos;re ready.
        </p>
      </div>

      <div className="relative z-10 w-full">
        <Tabs defaultValue="monthly">
          <div className="flex justify-center">
            <TabsList className="h-11 rounded-full border border-white/40 bg-white/40 p-1.5 backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/40">
              <TabsTrigger
                value="monthly"
                className="h-full rounded-full border-none px-6 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white/10 dark:data-[state=active]:shadow-none"
              >
                Monthly
              </TabsTrigger>
              <TabsTrigger
                value="yearly"
                className="h-full rounded-full border-none px-6 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white/10 dark:data-[state=active]:shadow-none"
              >
                Yearly
                <span className="ml-1.5 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  Save 20%
                </span>
              </TabsTrigger>
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

      <div className="relative z-10 text-center">
        <p className="text-muted-foreground mb-3 text-sm">
          Already subscribed?
        </p>
        <ManageSubscriptionButton className="rounded-full" />
      </div>
    </div>
  );
}
