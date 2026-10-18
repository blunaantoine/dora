import { Skeleton } from "@/components/ui/skeleton";

// Squelette de chargement commun aux pages admin (navigation dynamique).
export function AdminListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-[220px]" />
      </div>
      <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card">
        <div className="space-y-3 p-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-9 flex-1" />
              <Skeleton className="hidden h-9 w-32 sm:block" />
              <Skeleton className="hidden h-9 w-24 md:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return <AdminListSkeleton />;
}
