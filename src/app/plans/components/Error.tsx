import Link from 'next/link';

interface PlanDetailPageErrorProps {
  message?: string;
}

/**
 * Renders a full-screen error UI for the plan detail page.
 *
 * Displays a prominent "Error Loading Plan" heading, a provided error message or a default
 * fallback message, and a button linking back to the plans list.
 *
 * @param message - Optional custom error message to display instead of the default text
 * @returns The React element representing the error page UI
 */
export default function PlanDetailPageError({
  message,
}: PlanDetailPageErrorProps) {
  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4"
    >
      <h1 className="mb-4 text-3xl font-bold text-red-600">
        Error Loading Plan
      </h1>
      <p className="mb-6 text-gray-700">
        {message ??
          'There was an error loading the learning plan. Please try again later.'}
      </p>
      <Link
        href="/plans"
        className="rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
      >
        Back to Plans
      </Link>
    </div>
  );
}
