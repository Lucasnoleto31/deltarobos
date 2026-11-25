import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto das abas do robô. Aparece dentro do layout, com o cabeçalho e as abas já na tela, então desenha
 * só a página, na forma que toda aba tem desde a ficha Mesa (25/11/2026): a linha de título com o período, o
 * número grande com os fatos ao lado, a curva na largura toda e o começo de uma lista. Sem caixas, como a
 * página. No celular os fatos vêm depois da curva, como na tela.
 */
export default function CarregandoRobo() {
  return (
    <div className="space-y-10" aria-busy aria-label="Carregando">
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
          <div className="hidden w-full max-w-[26rem] space-y-3 xl:block">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
        <Skeleton className="mt-8 h-60 w-full lg:h-[clamp(14rem,calc(100dvh_-_41rem),27rem)]" />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
