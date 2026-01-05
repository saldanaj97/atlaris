import { QuickStats } from './QuickStats';

export function ActivityStreamHeader() {
  return (
    <header className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-slate-900">
            Activity Feed
          </h1>
          <p className="text-slate-500">
            Your learning journey, moment by moment
          </p>
        </div>
      </div>
      <QuickStats />
    </header>
  );
}
