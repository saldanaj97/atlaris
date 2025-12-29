/**
 * Dashboard layout with consistent container constraints.
 * Applies max-width and padding for all dashboard pages.
 */
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
