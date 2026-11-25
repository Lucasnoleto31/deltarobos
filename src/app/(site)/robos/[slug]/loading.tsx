import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto da visão geral. Aparece dentro do layout do robô, com o cabeçalho e as abas já na tela, então
 * desenha só a página, na forma que ela tem desde a ficha Mesa (25/11/2026): a linha de título com o
 * período, o número grande com os fatos ao lado, a curva na largura toda e duas listas lado a lado. Sem
 * caixas, como a página.
 */
export default function CarregandoRobo() {
  return (
    <div className="space-y-10" aria-busy aria-label="Carregando robô">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-x-16 gap-y-6">
          <div className="space-y-3">
            <Skeleton className="h-14 w-72 max-w-full" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <div className="w-full max-w-[22rem] space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
        <Skeleton className="mt-8 h-[360px] w-full" />
      </div>

      <div className="grid gap-x-12 gap-y-10 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-7">
          <Skeleton className="h-4 w-40" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
        <div className="space-y-3 xl:col-span-5">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
