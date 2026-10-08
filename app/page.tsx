export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Vecta</h1>
      <p className="max-w-xl text-slate-400">
        Trace how a geopolitical or economic headline could propagate to the
        companies in your portfolio.
      </p>
      <a
        href="/analyze"
        className="rounded-md bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-400"
      >
        Analyze a headline
      </a>
    </main>
  );
}
