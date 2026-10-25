export default function ServiceDetailLoading() {
  return (
    <main className="min-h-[70vh] bg-canvas px-5 py-10 text-ink">
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="h-5 w-32 rounded bg-soft" />
        <div className="mt-8 h-72 rounded-2xl bg-surface" />
        <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="h-96 rounded-2xl bg-surface" />
          <div className="h-72 rounded-2xl bg-surface" />
        </div>
      </div>
    </main>
  );
}
