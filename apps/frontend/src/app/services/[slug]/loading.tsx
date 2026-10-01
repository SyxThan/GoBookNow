export default function ServiceDetailLoading() {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="h-5 w-32 rounded bg-slate-800" />
        <div className="mt-8 h-72 rounded-3xl bg-slate-900" />
        <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="h-96 rounded-3xl bg-slate-900" />
          <div className="h-72 rounded-3xl bg-slate-900" />
        </div>
      </div>
    </main>
  );
}
