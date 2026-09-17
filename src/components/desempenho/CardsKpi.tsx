import { cn } from "cn";

export type TomKpi = "positivo" | "negativo" | "neutro" | "info" | "alerta";

export interface ItemKpi {
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
  /** Mantidos na interface para não mexer em quem chama; desde 17/09/2026 o cartão não pinta nem mostra ícone. */
  tom?: TomKpi;
  icone?: React.ReactNode;
}

interface Props {
  itens: ItemKpi[];
  className?: string;
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
          <p className="rotulo-metrica">{item.rotulo}</p>
          <p className="mt-2 text-xl leading-none font-semibold tracking-tight tabular-nums">{item.valor}</p>
          {item.detalhe ? <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">{item.detalhe}</p> : null}
        </div>
      ))}
    </div>
  );
}
