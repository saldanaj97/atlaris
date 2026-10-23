import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import {
  LegalContactLink,
  LegalDocument,
  LegalSection,
} from '@/app/(landing)/_shared/LegalDocument';
import { ROUTES } from '@/features/navigation/routes';
import { OG_DEFAULT_IMAGE } from '@/shared/constants/brand-assets';
import Link from 'next/link';

const PRIVACY_TITLE = 'Privacy Policy | Atlaris';
const PRIVACY_DESCRIPTION =
  'What information Atlaris collects, how it is used, which service providers handle it, and the choices you have.';

export const metadata: Metadata = {
  title: PRIVACY_TITLE,
  description: PRIVACY_DESCRIPTION,
  openGraph: {
    title: PRIVACY_TITLE,
    description: PRIVACY_DESCRIPTION,
    url: ROUTES.PRIVACY,
    images: [OG_DEFAULT_IMAGE],
    type: 'website',
    siteName: 'Atlaris',
  },
  twitter: {
    card: 'summary_large_image',
    title: PRIVACY_TITLE,
    description: PRIVACY_DESCRIPTION,
    images: [OG_DEFAULT_IMAGE.url],
    site: '@atlarisapp',
    creator: '@atlarisapp',
  },
};

export default function PrivacyPage(): ReactElement {
  return (
    <LegalDocument overline='Legal' title='Privacy Policy'>
      <LegalSection id='privacy-who' heading='1. Who we are'>
        <p>
          Atlaris is operated by Juan Carlos Saldana Jr., a sole proprietor
          based in Texas. This policy explains what personal information we
          collect when you use Atlaris, how we use it, and the choices you have.
          It should be read with our{' '}
          <Link href={ROUTES.TERMS}>Terms of Service</Link>. Contact:{' '}
          <LegalContactLink />.
        </p>
      </LegalSection>

      <LegalSection id='privacy-collect' heading='2. Information we collect'>
        <ul>
          <li>
            <strong>Account information:</strong> your email address and name,
            provided through our authentication provider (Clerk), including when
            you sign in with Google.
          </li>
          <li>
            <strong>Learning-plan content:</strong> the goals and details you
            enter to create a plan, and the plans, modules, and progress
            generated and recorded for you.
          </li>
          <li>
            <strong>Billing information:</strong> your subscription plan and
            status. Payment details are handled by Stripe through Clerk Billing.
          </li>
          <li>
            <strong>Usage analytics:</strong> how you use the product, such as
            pages viewed and features used, along with basic device and browser
            information.
          </li>
          <li>
            <strong>Error diagnostics:</strong> technical details about errors
            and performance problems so we can fix them.
          </li>
          <li>
            <strong>Email preferences:</strong> whether you have opted in to
            reminder emails and other notifications.
          </li>
        </ul>
        <p>
          We do not record or replay your sessions, and we do not use
          advertising networks.
        </p>
      </LegalSection>

      <LegalSection id='privacy-use' heading='3. How we use information'>
        <ul>
          <li>To provide the service, including generating your plans.</li>
          <li>To manage your account and process subscriptions.</li>
          <li>To understand usage, fix bugs, and improve the product.</li>
          <li>
            To send service messages and, if you opt in, reminder emails. Every
            reminder email includes a one-click unsubscribe link.
          </li>
          <li>
            To protect the service against abuse and to meet legal duties.
          </li>
        </ul>
        <p>We do not sell your personal information.</p>
      </LegalSection>

      <LegalSection id='privacy-providers' heading='4. Service providers'>
        <p>
          We share information with the following providers only as needed to
          run Atlaris:
        </p>
        <ul>
          <li>
            <strong>Clerk:</strong> authentication, account management, and
            subscription billing.
          </li>
          <li>
            <strong>Stripe:</strong> payment processing for paid plans, through
            Clerk Billing.
          </li>
          <li>
            <strong>Supabase:</strong> database hosting for account and plan
            data.
          </li>
          <li>
            <strong>Vercel:</strong> application hosting, plus Vercel Analytics
            and Speed Insights for traffic and performance measurement.
          </li>
          <li>
            <strong>Cloudflare:</strong> Workers that run background jobs, such
            as plan generation and regeneration, and Turnstile bot protection on
            sign-up.
          </li>
          <li>
            <strong>PostHog:</strong> product analytics. When you sign in, your
            email address and name are sent to PostHog to identify you in
            analytics.
          </li>
          <li>
            <strong>Sentry:</strong> error monitoring and diagnostics. When
            something fails, Sentry receives technical details such as the
            error, the page or request involved, and your browser and device
            type. We don&rsquo;t attach your name, email address, or IP address
            to error reports, but they may include internal account or plan
            identifiers.
          </li>
          <li>
            <strong>Resend:</strong> delivery of email.
          </li>
          <li>
            <strong>
              OpenRouter, and the AI model providers it routes to (Anthropic,
              Google, and OpenAI):
            </strong>{' '}
            the plan inputs you submit are sent to an AI model to generate your
            plan content.
          </li>
        </ul>
        <p>
          These providers process information under their own terms and privacy
          policies. We may also disclose information if required by law or to
          protect rights and safety.
        </p>
      </LegalSection>

      <LegalSection id='privacy-cookies' heading='5. Cookies and local storage'>
        <p>
          We and our providers use cookies and similar technologies to keep you
          signed in, remember preferences, and measure usage and performance.
          You can control cookies in your browser settings, though parts of
          Atlaris may not work without them.
        </p>
      </LegalSection>

      <LegalSection id='privacy-retention' heading='6. Retention and deletion'>
        <p>
          We keep your information while your account is active. You can delete
          your account at any time from Settings &rarr; Profile, or by emailing{' '}
          <LegalContactLink />. Deleting your account ends any paid
          subscription, removes your sign-in identity from our authentication
          provider, and erases your learning plans, progress, settings, and
          usage records. We keep a minimal record that the account existed and
          was deleted, without your email address or name, so we can process
          related billing events, along with records we must keep for legal,
          tax, or fraud-prevention reasons. Copies in backups or at our
          providers may persist for a limited time until they expire in the
          ordinary course. Sentry cannot delete one person&rsquo;s error
          reports, so deleting your account does not remove them; Sentry deletes
          all error and diagnostic data automatically within 30 days.
        </p>
      </LegalSection>

      <LegalSection id='privacy-rights' heading='7. Your choices and rights'>
        <p>
          Depending on where you live, you may have the right to access the
          personal information we hold about you, correct it, or ask us to
          delete it. To make a request, email <LegalContactLink />. We may need
          to verify your identity first. You can also unsubscribe from reminder
          emails at any time using the link in each email.
        </p>
      </LegalSection>

      <LegalSection id='privacy-children' heading='8. Children'>
        <p>
          Atlaris is for adults aged 18 and over and is not directed to
          children. If we learn that we collected personal information from
          someone under 18, and in particular from a child under 13, we will
          delete the account and its data. If you are a parent or guardian and
          believe your child has used Atlaris, contact <LegalContactLink />.
        </p>
      </LegalSection>

      <LegalSection id='privacy-security' heading='9. Security and transfers'>
        <p>
          We use reasonable safeguards to protect your information, but no
          system is perfectly secure. Your information may be processed in the
          United States and in other countries where our providers operate.
        </p>
      </LegalSection>

      <LegalSection id='privacy-changes' heading='10. Changes to this policy'>
        <p>
          We may update this policy from time to time. We will change the date
          at the top of this page and, for material changes, make reasonable
          efforts to notify you.
        </p>
      </LegalSection>

      <LegalSection id='privacy-contact' heading='11. Contact'>
        <p>
          Questions or requests about your privacy? Email <LegalContactLink />.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
