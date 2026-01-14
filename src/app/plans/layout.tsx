export default function PlansLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-8">{children}</div>
  );
}
