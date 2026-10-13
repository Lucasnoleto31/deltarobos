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
  /**
   * Número protagonista (13/10/2026): o do hero, o grande do card do robô, o do KPI de resultado. O "R$" e o
   * "pts" saem a 60% do tamanho e mais leves que os algarismos, o sinal fica no tamanho do número, e o peso e
   * o espaçamento são os de título (semibold, tracking-tight, leading-none). O tamanho continua vindo do
   * className de quem chama (text-3xl, text-5xl...). O texto lido é o mesmo de sempre; sem `destaque`, nada muda.
   */
  destaque?: boolean;
  className?: string;
}

// "+R$ 1.234,56", "-R$ 12", "R$ 0,00": o sinal, o símbolo e o resto (o Intl põe um espaço fixo depois do R$)
const PARTES_BRL = /^([+\-−]?)(R\$)(\s?)(.*)$/u;
const SUFIXO_PONTOS = " pts";

/** a unidade menor e mais leve que o número, no Valor em destaque */
function Unidade({ children }: { children: React.ReactNode }) {
  return <span className="text-[0.6em] font-medium tracking-normal">{children}</span>;
}

/**
 * Número formatado em pt-BR, tabular, colorido pelo sinal: verde acima de zero, vermelho abaixo, cinza no zero.
 * Não quebra linha: sinal, "R$" e "pts" ficam com o número (19/09/2026).
 */
export function Valor({
  valor,
  unidade = "brl",
  sinal = true,
  inteiro = false,
  colorir = true,
  destaque = false,
  className,
}: Props) {
  const v = Number.isFinite(valor) ? valor : 0;
  const texto =
    unidade === "brl"
      ? formatarBRL(v, { sinal, inteiro })
      : unidade === "pontos"
        ? `${formatarPontos(v, sinal)}${SUFIXO_PONTOS}`
        : formatarPct(v);

  const cor = !colorir
    ? ""
    : v > 0
      ? "text-positivo"
      : v < 0
        ? "text-negativo"
        : "text-muted-foreground";

  let conteudo: React.ReactNode = texto;
  if (destaque && unidade === "brl") {
    const partes = PARTES_BRL.exec(texto);
    if (partes) {
      const [, sinalTexto, simbolo, espaco, numero] = partes;
      conteudo = (
        <>
          {sinalTexto}
          <Unidade>
            {simbolo}
            {espaco}
          </Unidade>
          {numero}
        </>
      );
    }
  } else if (destaque && unidade === "pontos") {
    conteudo = (
      <>
        {texto.slice(0, -SUFIXO_PONTOS.length)}
        <Unidade>{SUFIXO_PONTOS}</Unidade>
      </>
    );
  }

  return (
    <span
      className={cn(
        "whitespace-nowrap tabular-nums",
        destaque && "leading-none font-semibold tracking-tight",
        cor,
        className,
      )}
    >
      {conteudo}
    </span>
  );
}
