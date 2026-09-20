import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto da visão geral. Aparece dentro do layout do robô, com o cabeçalho e as abas já na tela,
 * então desenha só a página: o painel de resultado (filtro de período, número, azulejos e curva) e o
 * resumo (quatro cartões e oito linhas). 19/09/2026: eram um cabeçalho repetido e doze cartões iguais,
 * a forma que a página tinha antes do layout e da lista agrupada.
 */
export default function CarregandoRobo() {
  return (
    <div className="space-y-10" aria-busy aria-label="Carregando robô">
      <div className="painel">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b px-4 py-3 sm:px-5">
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-8 w-64 max-w-full rounded-full" />
        </div>
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1fr_1.6fr] lg:items-start">
          <div className="space-y-5">
            <div className="space-y-2">
              <Skeleton className="h-11 w-52 sm:h-12" />
              <Skeleton className="h-4 w-60 max-w-full" />
              <Skeleton className="h-3 w-48" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-19 rounded-xl" />
              ))}
              <Skeleton className="col-span-2 h-15 rounded-xl" />
            </div>
          </div>
          <Skeleton className="h-[330px] w-full" />
        </div>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-7 w-40" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="painel space-y-2 p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-28 max-w-full" />
              <Skeleton className="h-3 w-24 max-w-full" />
            </div>
          ))}
        </div>
        <div className="painel grid sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-3.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
