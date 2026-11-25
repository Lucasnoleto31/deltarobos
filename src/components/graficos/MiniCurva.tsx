import { cn } from "cn";
import { maiorQueda } from "@/lib/stats/serie-casa";
import { caminhoMonotono } from "./curva-monotona";

interface Props {
  /** acumulado ponto a ponto */
  pontos: number[];
  altura?: number;
  className?: string;
  /**
   * Sem efeito desde a ficha Mesa (25/11/2026): a curva é sempre neutra. "sinal" pintava a linha de verde ou
   * de vermelho conforme o fim dela, com a área embaixo; "neutra" nasceu para a lista de robôs não virar um
   * arco-íris e virou o único desenho. A prop fica para não quebrar quem a passa.
   */
  cor?: "sinal" | "neutra";
}

// folga de cima e de baixo, a mesma margin 2 do AreaChart que desenhava isto antes
const MARGEM = 2;

/**
 * A curva pequena (linha de lista, card do embed). Em 18/09/2026 saiu do recharts para SVG puro (a biblioteca
 * inteira vinha para o navegador só por isto) com a mesma geometria: largura toda, escala de mínimo a máximo e
 * curva monótona. Sem estado nem efeito: no CardEmbed sai pronta do servidor, sem JS.
 *
 * Desde a ficha Mesa (25/11/2026) é a assinatura do sistema em miniatura, como a da lista da página inicial:
 * linha fina na cor do texto corrente e, em vermelho na própria linha, a maior queda do trecho (do ponto mais
 * alto ao mais baixo que veio depois). Era verde ou vermelha conforme o fim da curva, com a área preenchida:
 * verde não entra em curva, e área também não.
 */
export function MiniCurva({ pontos, altura = 44, className }: Props) {
  if (pontos.length < 2) {
    return (
      <div className={cn("flex items-center text-xs text-sutil", className)} style={{ height: altura }}>
        Sem histórico suficiente
      </div>
    );
  }

  // viewBox de 100 de largura esticado na horizontal; a espessura não estica (non-scaling-stroke)
  const min = Math.min(...pontos);
  const max = Math.max(...pontos);
  const topo = MARGEM;
  const fundo = altura - MARGEM;
  const y = (v: number) => (max === min ? (topo + fundo) / 2 : fundo - ((v - min) / (max - min)) * (fundo - topo));
  const passo = 100 / (pontos.length - 1);
  const xs = pontos.map((_, i) => i * passo);
  const ys = pontos.map(y);

  const linha = caminhoMonotono(xs, ys);

  // A maior queda, pela mesma conta da página inicial. A conta parte do zero, e aqui a partida é o primeiro
  // ponto (o trecho não começa do zero): os valores entram descontados dele. O trecho vermelho é recortado do
  // próprio traçado, pedaço a pedaço, para cair exatamente em cima da linha: cada "C" liga um ponto ao seguinte.
  const q = maiorQueda(pontos.map((v) => ({ acumulado: v - pontos[0] })));
  let trecho: string | null = null;
  if (q && q.valor > 0) {
    const de = Math.max(0, q.iInicio);
    const pedacos = linha.split(/(?=[CL])/).slice(1);
    if (q.iFundo > de && pedacos.length === pontos.length - 1) {
      trecho = `M${Math.round(xs[de] * 1000) / 1000},${Math.round(ys[de] * 1000) / 1000}${pedacos.slice(de, q.iFundo).join("")}`;
    }
  }

  return (
    <div className={cn("w-full", className)} style={{ height: altura }} aria-hidden>
      <svg viewBox={`0 0 100 ${altura}`} preserveAspectRatio="none" width="100%" height="100%" className="block overflow-visible">
        <path d={linha} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {trecho ? (
          <path d={trecho} fill="none" stroke="var(--negativo)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ) : null}
      </svg>
    </div>
  );
}
