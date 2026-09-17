// Peças comuns dos gráficos, trazidas do Zeve Hub (17/09/2026, pedido do Artur: "os gráficos do hub
// vai bem"). Sem biblioteca: as barras são HTML, para o texto não encolher com a largura da tela, e a
// curva é SVG esticado com traço de espessura fixa. Regras do kit estético (blocos 4 e 7): barra com
// gradiente vertical e trilho atrás, linhas-guia horizontais pontilhadas e nenhuma vertical, e a dica
// em cartão com a contagem crua. Aqui só se desenha: todo número chega pronto de quem chama.

import type { PointerEvent as ReactPointerEvent } from "react";

export type Tom = "positivo" | "negativo" | "acento" | "neutro";
export interface LinhaDaDica {
  rotulo: string;
  valor: string;
  tom?: Tom;
}
export interface ConteudoDaDica {
  titulo: string;
  subtitulo?: string;
  linhas: LinhaDaDica[];
}

/** Verde no positivo, vermelho no negativo, neutro no zero. */
export const tomDe = (v: number): Tom => (v > 0 ? "positivo" : v < 0 ? "negativo" : "neutro");

/** A cor de um token misturada ao transparente, para os degradês e os trilhos. */
export const mistura = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${pct}%, transparent)`;

// passo "redondo" (1, 2, 2,5, 5 × 10ⁿ) para poucas marcas no eixo
export function passo(amplitude: number, marcas = 3): number {
  const bruto = amplitude / marcas;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / pot;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pot;
}

/** Escala das barras: do fundo ao topo em passos redondos, com o zero sempre dentro. */
export function escala(valores: number[]) {
  const max = valores.reduce((m, v) => Math.max(m, v), 0);
  const min = valores.reduce((m, v) => Math.min(m, v), 0);
  const p = passo(max - min || 1);
  const fundo = Math.floor(min / p) * p;
  const topo = Math.max(Math.ceil(max / p) * p, fundo + p);
  const marcas: number[] = [];
  for (let v = fundo; v <= topo + p / 2; v += p) marcas.push(Math.round(v * 100) / 100);
  const y = (v: number) => ((topo - v) / (topo - fundo)) * 100;
  return { topo, fundo, marcas, y };
}

interface PropsEixo {
  marcas: number[];
  y: (v: number) => number;
  altura: number;
  formatar: (v: number) => string;
  /** lado em que o eixo fica: o texto encosta no gráfico */
  lado?: "esquerda" | "direita";
}

/** Os rótulos do eixo. As cópias invisíveis só dão a largura da coluna; as visíveis ficam na altura da marca. */
export function Eixo({ marcas, y, altura, formatar, lado = "esquerda" }: PropsEixo) {
  return (
    <div aria-hidden className="relative text-[11px] text-muted-foreground tabular-nums" style={{ height: altura }}>
      {marcas.map((m) => (
        <span key={m} className="invisible block h-0 leading-none whitespace-nowrap">
          {formatar(m)}
        </span>
      ))}
      {marcas.map((m) => (
        <span
          key={m}
          className={`absolute -translate-y-1/2 leading-none whitespace-nowrap ${lado === "esquerda" ? "right-0" : "left-0"}`}
          style={{ top: `${y(m)}%` }}
        >
          {formatar(m)}
        </span>
      ))}
    </div>
  );
}

/** Linhas-guia horizontais pontilhadas; a do zero mais forte. */
export function Guias({ marcas, y }: { marcas: number[]; y: (v: number) => number }) {
  return (
    <>
      {marcas.map((m) => (
        <div
          key={m}
          aria-hidden
          className="absolute inset-x-0 border-t border-dotted"
          style={{ top: `${y(m)}%`, borderColor: mistura("--foreground", m === 0 ? 22 : 8) }}
        />
      ))}
    </>
  );
}

const COR_DO_TOM: Record<Tom, string> = {
  positivo: "text-positivo",
  negativo: "text-negativo",
  acento: "text-primary",
  neutro: "text-foreground",
};

/** O que vai dentro da dica: título, subtítulo e as linhas de rótulo e valor. */
export function CorpoDaDica({ conteudo }: { conteudo: ConteudoDaDica }) {
  return (
    <>
      <div className="grid gap-0.5">
        <span className="text-xs font-semibold">{conteudo.titulo}</span>
        {conteudo.subtitulo ? <span className="text-muted-foreground">{conteudo.subtitulo}</span> : null}
      </div>
      {conteudo.linhas.length > 0 ? (
        <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-5 gap-y-1 border-t pt-2">
          {conteudo.linhas.map((l) => (
            <div key={l.rotulo} className="contents">
              <dt className="text-muted-foreground">{l.rotulo}</dt>
              <dd className={`text-right font-medium whitespace-nowrap tabular-nums ${COR_DO_TOM[l.tom ?? "neutro"]}`}>{l.valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </>
  );
}

/**
 * A dica no alto do gráfico, ao lado do ponto apontado: à direita dele na metade esquerda e à
 * esquerda na metade direita, para não cobrir o que está sendo lido. Encosta na borda em vez de sair.
 */
export function Dica({ conteudo, emPct }: { conteudo: ConteudoDaDica; emPct: number }) {
  const lado =
    emPct < 50
      ? { left: `clamp(0px, calc(${emPct}% + 12px), calc(100% - 15rem))` }
      : { right: `clamp(0px, calc(${100 - emPct}% + 12px), calc(100% - 15rem))` };
  return (
    <div role="status" className="dica-caixa top-1" style={lado}>
      <CorpoDaDica conteudo={conteudo} />
    </div>
  );
}

/** Em qual das `total` colunas o ponteiro (ou o dedo) está. */
export function indiceApontado(e: ReactPointerEvent<HTMLDivElement>, total: number): number {
  const caixa = e.currentTarget.getBoundingClientRect();
  const x = (e.clientX - caixa.left) / (caixa.width || 1);
  return Math.min(total - 1, Math.max(0, Math.floor(x * total)));
}

/**
 * A força de 0 a 1 de cada valor, para pintar calendário e mapas (lição do Hub). O teto é o 9º décimo
 * dos valores absolutos, e não o maior: com o maior dia como régua, um dia fora da curva deixava
 * todos os outros no tom mais fraco, e o calendário inteiro ficava da mesma cor. Acima do teto, cor cheia.
 */
export function escalaDeForca(valores: number[]): (valor: number) => number {
  const absolutos = valores
    .map((v) => Math.abs(v))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const teto = absolutos[Math.floor((absolutos.length - 1) * 0.9)] ?? 0;
  return (valor) => (teto > 0 ? Math.min(1, Math.abs(valor) / teto) : 0);
}
