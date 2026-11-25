import { cn } from "cn";

/**
 * Cabeçalho de página do sistema (ficha Mesa, 25/11/2026): o caminho em cima (discreto, sem caixa alta), o
 * título, uma linha de descrição e as ações à direita. A página inicial não usa: lá o número grande é o
 * topo. `children` vai embaixo (linha de dados do robô).
 */
export function CabecalhoPagina({
  sobre,
  titulo,
  descricao,
  acoes,
  children,
  className,
}: {
  sobre?: React.ReactNode;
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("conteudo pt-8 lg:pt-9", className)}>
      <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between">
        <div className="min-w-0 md:flex-1">
          {sobre ? <p className="eyebrow mb-2">{sobre}</p> : null}
          <h1 className="text-balance text-[1.75rem] leading-tight font-medium tracking-tight sm:text-[2rem]">{titulo}</h1>
          {descricao ? <p className="mt-2 max-w-3xl text-pretty text-[0.9375rem] text-muted-foreground">{descricao}</p> : null}
        </div>
        {acoes ? <div className="flex min-w-0 flex-wrap items-center gap-2 md:shrink-0">{acoes}</div> : null}
      </div>
      {children}
    </header>
  );
}

/** A área de trabalho: as seções empilhadas, separadas por espaço (40 px), sem caixa. */
export function CorpoPagina({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("conteudo space-y-10 pt-8 pb-14 lg:pt-9", className)}>{children}</div>;
}

/**
 * Grade de 12 colunas da área de trabalho, a partir de xl; abaixo disso as seções empilham. Os filhos
 * dizem quanto ocupam com `xl:col-span-N`. É o que faz a tela inteira ser usada: duas seções lado a lado
 * em vez de uma coluna. O vão entre colunas é largo (48 px): sem caixa, é o espaço que separa.
 */
export function Grade({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-x-12 gap-y-10 xl:grid-cols-12", className)}>{children}</div>;
}

/**
 * Uma frase em português de quem não é do mercado, com o número dentro (25/11/2026, Lucas: "para um leigo
 * está muito difícil de entender"). Vai debaixo do gráfico ou do número grande, nunca como título de
 * marketing. `apoio` é a segunda linha.
 */
export function Frase({ children, apoio, className }: { children: React.ReactNode; apoio?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("max-w-4xl", className)}>
      <p className="text-pretty text-sm leading-relaxed text-muted-foreground [&_b]:font-medium [&_b]:text-foreground">{children}</p>
      {apoio ? <p className="mt-1 text-pretty text-[0.8125rem] text-sutil">{apoio}</p> : null}
    </div>
  );
}
