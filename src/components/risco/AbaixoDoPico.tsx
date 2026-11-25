"use client";

import { cn } from "cn";
import { formatarBRL } from "@/lib/formato";
import type { PontoCurva } from "@/lib/stats/tipos";

interface Props {
  curva: readonly PontoCurva[];
  /** o pregão sob o ponteiro: o mesmo índice da curva de cima, para a mira cair no mesmo dia */
  ativo: number | null;
  aoApontar: (indice: number | null) => void;
  className?: string;
}

// até aqui cada pregão é uma coluna com vão, na largura das barras do GraficoResultado; acima disso as colunas
// encostam uma na outra (com vão de menos de 1 px o desenho vira um chuvisco)
const COLUNAS_COM_VAO = 120;

/**
 * "−R$ 35 mil": a escrita do eixo da curva (GraficoResultado). Sem casa decimal a partir de dez mil, para o
 * rótulo caber na calha da direita no celular.
 */
function noEixo(v: number): string {
  const abs = Math.abs(v);
  if (abs < 1000) return formatarBRL(v, { inteiro: true });
  const mil = (abs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: abs >= 10_000 ? 0 : 1 });
  return `${v < 0 ? "−" : ""}R$ ${mil} mil`;
}

/**
 * Quanto o resultado ficou abaixo do topo em cada pregão: uma coluna vermelha pendurada no fio de cima, mais
 * funda quanto maior a queda naquele dia. No fio, o robô está no topo. É o gráfico que o Artur pediu em
 * 18/09/2026 no lugar dos blocos por episódio ("feios e pouco intuitivos").
 *
 * Desde a ficha Mesa (25/11/2026) deixou de ser um gráfico à parte, com caixa, eixo em % e leitura própria:
 * virou a faixa que vai colada debaixo da curva da aba Quedas e risco, no mesmo eixo de tempo (uma coluna por
 * pregão, a mesma calha à direita), em R$ como o número grande da tela. Colunas chapadas, sem gradiente e sem
 * trilho. A leitura do dia apontado fica com quem chama, que troca o número grande; aqui só se desenha a mira.
 * A coluna mais funda encosta no pé da faixa: é a maior queda, o valor escrito na calha.
 *
 * Sem queda nenhuma no período (ou com menos de dois pregões) não há o que desenhar: não aparece.
 */
export function AbaixoDoPico({ curva, ativo, aoApontar, className }: Props) {
  const n = curva.length;
  const maior = curva.reduce((m, p) => Math.max(m, -p.drawdown), 0);
  if (n < 2 || maior <= 0) return null;

  const f = (v: number) => (Math.round(v * 1000) / 1000).toString();
  // o meio da coluna do pregão: a mesma conta da curva, para a mira das duas cair no mesmo ponto
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const fundo = (i: number) => (-curva[i].drawdown / maior) * 100;

  let desenho = "";
  if (n <= COLUNAS_COM_VAO) {
    const largura = (100 / n) * 0.62;
    curva.forEach((p, i) => {
      if (p.drawdown < 0) desenho += `M${f(x(i) - largura / 2)},0h${f(largura)}v${f(fundo(i))}h${f(-largura)}z`;
    });
  } else {
    // um contorno só, em degraus: com centenas de pregões, um retângulo por dia pesava no HTML
    let altura = 0;
    desenho = "M0,0";
    curva.forEach((_, i) => {
      const h = fundo(i);
      if (h !== altura) {
        desenho += `H${f((i / n) * 100)}V${f(h)}`;
        altura = h;
      }
    });
    desenho += "H100V0z";
  }

  const apontar = (e: React.PointerEvent<HTMLDivElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    const fracao = (e.clientX - caixa.left) / (caixa.width || 1);
    aoApontar(Math.min(n - 1, Math.max(0, Math.floor(fracao * n))));
  };

  const rotulo = "absolute left-full pl-2 text-[11px] leading-none whitespace-nowrap text-sutil sm:pl-3 sm:text-xs";

  return (
    // a calha da direita é a mesma da curva: os valores do eixo ficam nela
    <div role="img" aria-label="Quanto o resultado ficou abaixo do topo em cada pregão" className={cn("pr-16 sm:pr-20", className)}>
      <div
        className="relative h-14 cursor-crosshair touch-pan-y border-t border-(--painel-fio-forte) lg:h-16"
        onPointerMove={apontar}
        onPointerDown={apontar}
        onPointerLeave={() => aoApontar(null)}
      >
        <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 block size-full">
          <path d={desenho} fill="var(--negativo)" />
        </svg>
        <span aria-hidden className={cn(rotulo, "top-0 -translate-y-1/2")}>
          topo
        </span>
        <span aria-hidden className={cn(rotulo, "bottom-0 translate-y-1/2")}>
          {noEixo(-maior)}
        </span>

        {/* a mira: o fio no pregão apontado e o ponto no pé da coluna dele */}
        {ativo !== null && ativo < n ? (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-(--painel-fio-forte)" style={{ left: `${x(ativo)}%` }}>
            <i className="absolute left-1/2 size-[7px] -translate-1/2 rounded-full border border-background bg-foreground" style={{ top: `${fundo(ativo)}%` }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
