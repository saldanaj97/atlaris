import { ModelSelector } from '@/components/settings/model-selector';
import { Card } from '@/components/ui/card';
import { SubscriptionTier } from '@/lib/ai/types';
import { getEffectiveClerkUserId } from '@/lib/api/auth';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { getSubscriptionTier } from '@/lib/stripe/subscriptions';
import { redirect } from 'next/navigation';

export default async function AISettingsPage() {
  const clerkUserId = await getEffectiveClerkUserId();
  if (!clerkUserId) redirect('/sign-in?redirect_url=/settings/ai');

  const dbUser = await getUserByClerkId(clerkUserId);
  if (!dbUser) redirect('/plans/new');

  const sub = await getSubscriptionTier(dbUser.id);
  const userTier: SubscriptionTier =
    sub.subscriptionTier === 'starter'
      ? 'starter'
      : sub.subscriptionTier === 'pro'
        ? 'pro'
        : 'free';

  // TODO: [OPENROUTER-MIGRATION] Get user's preferred model from database when column exists:
  // const userPreferredModel = dbUser.preferredAiModel;
  const userPreferredModel = null;

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-6 py-8">
        <h1 className="mb-2 text-3xl font-bold">AI Preferences</h1>
        <p className="text-muted-foreground mb-6">
          Choose your preferred AI model for generating learning plans.
          Different models offer varying levels of quality, speed, and cost.
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <h2 className="mb-4 text-xl font-semibold">Model Selection</h2>
            <ModelSelector
              currentModel={userPreferredModel}
              userTier={userTier}
              // TODO: [OPENROUTER-MIGRATION] Implement onSave when API is ready:
              // onSave={async (modelId) => {
              //   'use server';
              //   await updateUserModelPreference(dbUser.id, modelId);
              // }}
            />
          </Card>

          <Card className="p-6">
            <h2 className="mb-4 text-xl font-semibold">About AI Models</h2>
            <div className="text-muted-foreground space-y-4 text-sm">
              <p>
                We offer a variety of AI models from leading providers including
                Google, OpenAI, Anthropic, and Alibaba. Each model has different
                strengths:
              </p>
              <ul className="list-inside list-disc space-y-2">
                <li>
                  <strong>Free models</strong> - Great quality at no cost,
                  perfect for most learning plans
                </li>
                <li>
                  <strong>Pro models</strong> - Advanced reasoning and larger
                  context windows for complex topics
                </li>
              </ul>
              <p>
                Your selected model will be used for all future plan
                generations. You can change it at any time.
              </p>
              <div className="border-main rounded-base bg-main/50 mt-4 border-2 p-3">
                <p className="text-xs">
                  <strong>Note:</strong> Model availability and pricing may
                  change. Free models are always available to all users.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
