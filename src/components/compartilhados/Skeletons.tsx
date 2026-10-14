import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonBarra() {
  return (
    <div className="flex h-10 items-center gap-4 border-b px-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="ml-auto h-4 w-28" />
    </div>
  );
}

export function SkeletonCardRobo() {
  return (
    <div className="flex flex-col gap-4 painel p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

export function SkeletonKpis({ quantidade = 8 }: { quantidade?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: quantidade }).map((_, i) => (
        <div key={i} className="painel p-4">
          <Skeleton className="mb-2 h-3 w-20" />
          <Skeleton className="h-6 w-28" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCurva() {
  return (
    <div className="painel p-4">
      <div className="mb-3 flex gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="ml-auto h-7 w-32" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

export function SkeletonLista({ linhas = 5 }: { linhas?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: linhas }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}
