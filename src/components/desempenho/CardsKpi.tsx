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
  /** chave do glossário: com ela, o rótulo ganha o i do "o que é" ao lado (19/09/2026) */
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

/**
 * Grade de cards de KPI, no desenho do Habitto: painel chapado, rótulo, número e linha de apoio.
 * Saíram o fundo tingido pelo tom e o quadradinho de ícone (17/09/2026): seis metáforas para seis
 * números não diziam nada que o rótulo já não dissesse, e a cor já vem no próprio número
 * (verde e vermelho só no resultado).
 */
export function CardsKpi({ itens, className }: Props) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6", className)}>
      {itens.map((item) => (
        <div key={item.rotulo} className="painel p-4">
          <p className="rotulo-metrica">
            <Rotulo item={item} />
          </p>
          <p className="mt-2 text-xl leading-none font-semibold tracking-tight tabular-nums">{item.valor}</p>
          {item.detalhe ? <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">{item.detalhe}</p> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * O resto dos números em lista agrupada: rótulo e apoio à esquerda, valor à direita, separador
 * encaixado. É o desenho que o Artur aprovou nos KPIs da visão geral (KpisRobo); desde 19/09/2026
 * no lugar das fileiras de cartões iguais do Desempenho e do Risco. Duas colunas a partir do lg,
 * e o fio sai das duas últimas linhas, que fecham o painel.
 */
export function ListaKpi({ itens, className }: Props) {
  return (
    <dl className={cn("painel grid overflow-hidden lg:grid-cols-2 lg:[&>div:nth-last-child(-n+2)]:after:hidden", className)}>
      {itens.map((item) => (
        <div key={item.rotulo} className="sep flex items-center justify-between gap-3 px-4 py-2.5 [--sep:16px]">
          <dt className="min-w-0">
            <span className="block text-sm">
              <Rotulo item={item} />
            </span>
            {item.detalhe ? <span className="block text-xs text-muted-foreground tabular-nums">{item.detalhe}</span> : null}
          </dt>
          <dd className="shrink-0 text-sm font-semibold whitespace-nowrap tabular-nums">{item.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
