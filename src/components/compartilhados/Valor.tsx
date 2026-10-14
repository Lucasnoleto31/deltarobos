import { cn } from "cn";
import { formatarBRL, formatarPct, formatarPontos } from "@/lib/formato";

type UnidadeValor = "brl" | "pontos" | "pct";

interface Props {
  valor: number;
  unidade?: UnidadeValor;
  /** mostra + e - (padrão sim) */
  sinal?: boolean;
  /** R$ sem centavos */
  inteiro?: boolean;
  /** verde/vermelho/cinza pelo sinal (padrão sim) */
  colorir?: boolean;
  className?: string;
}

/** Número formatado em pt-BR, tabular, colorido pelo sinal. Não quebra linha: sinal, "R$" e "pts" ficam com o número (19/09/2026). */
export function Valor({
  valor,
  unidade = "brl",
  sinal = true,
  inteiro = false,
  colorir = true,
  className,
}: Props) {
  const v = Number.isFinite(valor) ? valor : 0;
  const texto =
    unidade === "brl"
      ? formatarBRL(v, { sinal, inteiro })
      : unidade === "pontos"
        ? `${formatarPontos(v, sinal)} pts`
        : formatarPct(v);

  const cor = !colorir
    ? ""
    : v > 0
      ? "text-positivo"
      : v < 0
        ? "text-negativo"
        : "text-muted-foreground";

  return <span className={cn("whitespace-nowrap tabular-nums", cor, className)}>{texto}</span>;
}
