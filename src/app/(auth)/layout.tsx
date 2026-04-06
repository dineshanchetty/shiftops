export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-2)] px-4">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <h1 className="font-[var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-base-900)]">
            Shift<span className="text-[var(--color-accent)]">Ops</span>
          </h1>
          <p className="mt-1 text-sm text-[var(--color-base-400)]">
            Franchise Operations Management
          </p>
        </div>
        <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-[var(--color-base-200)]">
          {children}
        </div>
      </div>
    </div>
  );
}
