import { cn } from "cn";
import { useId } from "react";
import { caminhoMonotono } from "./curva-monotona";

interface Props {
  /** acumulado ponto a ponto */
  pontos: number[];
  altura?: number;
  className?: string;
  /**
   * A cor da linha e da área (13/10/2026), como valor de CSS: a do robô, corDoRobo(robo.ordem) de
   * src/lib/cores-robo.ts ("var(--robo-N)"), nunca escolhida pelo slug. Sem ela, como sempre: verde se a
   * curva terminou positiva (ou no zero), vermelha se negativa.
   */
  cor?: string;
}

// folga de cima e de baixo, a mesma margin 2 do AreaChart que desenhava isto antes
const MARGEM = 2;

/**
 * Sparkline do card: verde se terminou positivo, vermelho se negativo, ou a cor pedida em `cor` (a do
 * robô, 13/10/2026). Em 18/09/2026 saiu do
 * recharts para SVG puro (a biblioteca inteira vinha para o navegador só por isto) com a mesma
 * geometria: largura toda, escala de mínimo a máximo, curva monótona e a área fechando no zero
 * quando a curva cruza o zero (senão na borda mais próxima dele), como o baseValue "auto" fazia.
 * Sem estado nem efeito: no CardEmbed sai pronto do servidor, sem JS.
 */
export function MiniCurva({ pontos, altura = 44, className, cor: corPedida }: Props) {
  const idBruto = useId();
  const id = `mini-${idBruto.replace(/[^a-zA-Z0-9]/g, "")}`;

  if (pontos.length < 2) {
    return (
      <div
        className={cn("flex items-center text-xs text-muted-foreground", className)}
        style={{ height: altura }}
      >
        Sem histórico suficiente
      </div>
    );
  }

  const positivo = pontos[pontos.length - 1] >= 0;
  const cor = corPedida ?? (positivo ? "var(--positivo)" : "var(--negativo)");

  // viewBox de 100 de largura esticado na horizontal; a espessura não estica (non-scaling-stroke)
  const min = Math.min(...pontos);
  const max = Math.max(...pontos);
  const topo = MARGEM;
  const fundo = altura - MARGEM;
  const y = (v: number) =>
    max === min ? (topo + fundo) / 2 : fundo - ((v - min) / (max - min)) * (fundo - topo);
  const passo = 100 / (pontos.length - 1);
  const xs = pontos.map((_, i) => i * passo);
  const ys = pontos.map(y);

  const linha = caminhoMonotono(xs, ys);
  const base = Math.round(y(max < 0 ? max : Math.max(min, 0)) * 1000) / 1000;
  const area = `${linha}L100,${base}L0,${base}Z`;

  return (
    <div className={cn("w-full", className)} style={{ height: altura }} aria-hidden>
      <svg viewBox={`0 0 100 ${altura}`} preserveAspectRatio="none" width="100%" height="100%" className="block">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: cor, stopOpacity: 0.35 }} />
            <stop offset="100%" style={{ stopColor: cor, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id})`} stroke="none" />
        {/* a cor no style: var() e color-mix() valem em qualquer navegador como propriedade de CSS */}
        <path d={linha} fill="none" style={{ stroke: cor }} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
