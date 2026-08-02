export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-24 md:px-8">
      <div className="mb-8 h-10 w-64 animate-pulse rounded-full bg-white/[0.04]" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <div className="h-64 animate-pulse rounded-[2rem] bg-white/[0.03] md:col-span-7" />
        <div className="grid gap-6 md:col-span-5">
          <div className="h-20 animate-pulse rounded-[2rem] bg-white/[0.03]" />
          <div className="h-20 animate-pulse rounded-[2rem] bg-white/[0.03]" />
          <div className="h-20 animate-pulse rounded-[2rem] bg-white/[0.03]" />
        </div>
      </div>
    </div>
  );
}
