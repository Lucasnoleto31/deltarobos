import { SkeletonCurva, SkeletonKpis } from "@/components/compartilhados/Skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function CarregandoRobo() {
  return (
    <div className="conteudo space-y-10 py-8" aria-busy aria-label="Carregando robô">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="ml-auto h-6 w-28 rounded-full" />
        </div>
        <Skeleton className="h-4 w-full max-w-prose" />
        <Skeleton className="h-4 w-2/3 max-w-prose" />
      </div>
      <div className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-12 w-48" />
            <Skeleton className="h-16 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      </div>
      <SkeletonKpis quantidade={12} />
      <SkeletonCurva />
    </div>
  );
}
