import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-hidden="true" className="mx-auto max-w-5xl">
      <Skeleton className="h-6 w-64" />
      <div className="mt-4 rounded-xl border border-border bg-card p-5 sm:p-6">
        <Skeleton className="h-8 w-72" />
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-6 w-40" />
        </div>
      </div>
      <div className="mt-6 grid gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 sm:p-6">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-4 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-5/6" />
            <Skeleton className="mt-2 h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
