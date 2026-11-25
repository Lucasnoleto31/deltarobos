import { cn } from "cn";
import type { ChaveIndicador } from "@/components/compartilhados/glossario";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";

export type TomKpi = "positivo" | "negativo" | "neutro" | "info" | "alerta";

export interface ItemKpi {
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
  /** Mantidos na interface para não mexer em quem chama; desde 17/09/2026 o cartão não pinta nem mostra ícone. */
  tom?: TomKpi;
  icone?: React.ReactNode;
  /** chave do glossário: com ela, o rótulo vira o gatilho do "o que é" (sublinhado pontilhado, sem ícone) */
  info?: ChaveIndicador;
  /** troca o texto do glossário quando o número não é de um robô só (os robôs somados do Comparativo) */
  infoTexto?: string;
}

interface Props {
  itens: ItemKpi[];
  className?: string;
}

/** O rótulo, com o "o que é" quando o item traz a chave do glossário. */
function Rotulo({ item }: { item: ItemKpi }) {
  return item.info ? (
    <RotuloComInfo chave={item.info} texto={item.infoTexto}>
      {item.rotulo}
    </RotuloComInfo>
  ) : (
    item.rotulo
  );
}

// quantas colunas a faixa abre conforme quantos números traz (classes inteiras: o Tailwind não monta nome)
const GRADE: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 2xl:grid-cols-6",
};
const GRADE_LONGA = "grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6";

/**
 * Faixa de indicadores (ficha Mesa, 25/11/2026): um painel só, dividido por fios, com rótulo, número e
 * linha de apoio em cada célula. Eram N cartões soltos em grade; o nome e a interface ficaram para não
 * mexer em quem chama (Desempenho, Risco, Simulador, Comparativo). É o mesmo desenho de
 * `sistema/Indicadores`, recebendo a lista pronta.
 */
export function CardsKpi({ itens, className }: Props) {
  return (
    <dl className={cn("indicadores", GRADE[itens.length] ?? GRADE_LONGA, className)}>
      {itens.map((item) => (
        <div key={item.rotulo} className="indicador">
          <dt className="text-xs text-muted-foreground">
            <Rotulo item={item} />
          </dt>
          <dd className="mt-1.5 text-xl leading-none font-semibold tracking-tight tabular-nums sm:text-2xl">{item.valor}</dd>
          {item.detalhe ? <dd className="mt-1.5 text-xs text-pretty text-muted-foreground tabular-nums">{item.detalhe}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/**
 * O resto dos números em lista: rótulo e apoio à esquerda, valor à direita, uma linha por número com fio
 * entre elas. Duas colunas a partir do lg (três em tela muito larga), e o fio sai das linhas que fecham
 * o painel.
 */
export function ListaKpi({ itens, className }: Props) {
  return (
    <dl className={cn("grid gap-x-12 lg:grid-cols-2", className)}>
      {itens.map((item) => (
        <div key={item.rotulo} className="flex items-center justify-between gap-4 border-b border-(--painel-fio) py-2.5">
          <dt className="min-w-0">
            <span className="block text-sm">
              <Rotulo item={item} />
            </span>
            {item.detalhe ? <span className="block text-[0.8125rem] text-pretty text-sutil">{item.detalhe}</span> : null}
          </dt>
          <dd className="shrink-0 text-sm font-medium whitespace-nowrap">{item.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
