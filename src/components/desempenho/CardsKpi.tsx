import { cn } from "cn";

export type TomKpi = "positivo" | "negativo" | "neutro" | "info" | "alerta";

export interface ItemKpi {
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
  tom?: TomKpi;
  icone?: React.ReactNode;
}

const FUNDO: Record<TomKpi, string> = {
  positivo: "bg-positivo/8 ring-positivo/25",
  negativo: "bg-negativo/8 ring-negativo/25",
  neutro: "bg-card ring-foreground/10",
  info: "bg-info/8 ring-info/25",
  alerta: "bg-alerta/8 ring-alerta/25",
};

const ICONE: Record<TomKpi, string> = {
  positivo: "bg-positivo/15 text-positivo",
  negativo: "bg-negativo/15 text-negativo",
  neutro: "bg-muted text-muted-foreground",
  info: "bg-info/15 text-info",
  alerta: "bg-alerta/15 text-alerta",
};

interface Props {
  itens: ItemKpi[];
  className?: string;
}

/** Grade de cards de KPI com fundo tingido pelo tom. */
export function CardsKpi({ itens, className }: Props) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6", className)}>
      {itens.map((item) => {
        const tom = item.tom ?? "neutro";
        return (
          <div key={item.rotulo} className={cn("rounded-xl p-4 ring-1", FUNDO[tom])}>
            {item.icone ? (
              <span className={cn("mb-3 grid size-8 place-items-center rounded-lg", ICONE[tom])}>{item.icone}</span>
            ) : null}
            <p className="text-xs text-muted-foreground">{item.rotulo}</p>
            <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{item.valor}</p>
            {item.detalhe ? <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{item.detalhe}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
