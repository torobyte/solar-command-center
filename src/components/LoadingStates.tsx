import { Skeleton } from "@/components/ui/skeleton";

export function PageHeaderSkeleton() {
  return (
    <div className="mb-6 space-y-2 animate-fade-in">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={`rounded-2xl border bg-card p-5 space-y-3 animate-fade-in ${className ?? ""}`}>
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card animate-fade-in">
      <div className="border-b bg-muted/40 p-4">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className="h-4 w-24" />)}
        </div>
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="p-4">
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {Array.from({ length: cols }).map((_, c) => (
                <Skeleton key={c} className={`h-4 ${c === 0 ? "w-3/4" : "w-1/2"}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RuleListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-fade-in">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-9 rounded-full" />
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-9 rounded-md" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, j) => <Skeleton key={j} className="h-9 w-full" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-32 rounded-full" />
      </div>
      <Skeleton className="h-20 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border bg-background/50 p-3">
            <Skeleton className="h-14 w-14 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}

export function SectionSkeleton({ title }: { title?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5 sm:p-6 space-y-3 animate-fade-in">
      {title && <Skeleton className="h-5 w-40" />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between gap-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
