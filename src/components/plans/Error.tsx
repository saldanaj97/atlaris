import { Link } from 'lucide-react';

export default function PlanDetailPageError() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <h1 className="mb-4 text-3xl font-bold text-red-600">
        Error Loading Plan
      </h1>
      <p className="mb-6 text-gray-700">
        There was an error loading the learning plan. Please try again later.
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
