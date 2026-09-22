// Peças comuns dos gráficos, trazidas do Zeve Hub (17/09/2026, pedido do Artur: "os gráficos do hub
// vai bem"). Sem biblioteca: as barras são HTML, para o texto não encolher com a largura da tela, e a
// curva é SVG esticado com traço de espessura fixa. Regras do kit estético (blocos 4 e 7): barra com
// gradiente vertical e trilho atrás, linhas-guia horizontais pontilhadas e nenhuma vertical, e a
// leitura do ponto numa linha fixa acima do desenho (19/09/2026; antes, cartão flutuante). Aqui só
// se desenha: todo número chega pronto de quem chama.

import { cn } from "cn";
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

/** As cores da leitura sobre um fundo que não é o do site: a moldura grafite do Profit, escura nos dois temas. */
export interface PaletaDaLeitura {
  titulo: string;
  texto: string;
  rotulo: string;
  positivo: string;
  negativo: string;
}

/**
 * A leitura do ponto apontado numa linha fixa no alto do gráfico, como a legenda de dados do Profit.
 * Até 19/09/2026 era um cartão flutuante ao lado do ponteiro, e ele cobria o fim da curva, a etiqueta
 * do valor e a barra apontada ("quando passo o mouse sobre o gráfico de desempenho ele esconde o
 * resultado"). Aqui fica fora da área do desenho e não cobre nada; quem chama reserva a altura
 * (uma linha no largo, mais no estreito) para o gráfico não pular quando o texto muda.
 */
export function Leitura({ conteudo, paleta, className }: { conteudo: ConteudoDaDica; paleta?: PaletaDaLeitura; className?: string }) {
  const cor = (c?: string) => (c ? { color: c } : undefined);
  const corDoValor = (tom: Tom = "neutro") =>
    paleta ? { color: tom === "positivo" ? paleta.positivo : tom === "negativo" ? paleta.negativo : paleta.titulo } : undefined;
  return (
    <div
      role="status"
      className={cn("flex flex-wrap content-start items-baseline gap-x-4 gap-y-0.5 text-[11px] leading-4 tabular-nums", className)}
    >
      <span className="whitespace-nowrap">
        <span className={cn("font-semibold", !paleta && "text-foreground")} style={cor(paleta?.titulo)}>
          {conteudo.titulo}
        </span>
        {conteudo.subtitulo ? (
          <span className={cn(!paleta && "text-muted-foreground")} style={cor(paleta?.texto)}>
            {" · "}
            {conteudo.subtitulo}
          </span>
        ) : null}
      </span>
      {conteudo.linhas.map((l) => (
        <span key={l.rotulo} className="whitespace-nowrap">
          <span className={cn(!paleta && "text-muted-foreground")} style={cor(paleta?.rotulo)}>
            {l.rotulo}
          </span>{" "}
          <span className={cn("font-medium", !paleta && COR_DO_TOM[l.tom ?? "neutro"])} style={corDoValor(l.tom)}>
            {l.valor}
          </span>
        </span>
      ))}
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
 * O índice do ponto mais perto de `alvo` numa lista ordenada por `posicao` (crescente, empates
 * permitidos), por busca binária. Em empate de distância vale o primeiro, como a varredura que havia
 * até 22/09/2026 fazia; com a série por operação de até 20 mil pontos, varrer a lista a cada movimento
 * do ponteiro pesava. Lista vazia dá 0: quem chama já não desenha sem pontos.
 */
export function indiceMaisPerto(pontos: ReadonlyArray<{ posicao: number }>, alvo: number): number {
  const n = pontos.length;
  if (n === 0) return 0;
  // o primeiro índice com posição >= alvo
  let baixo = 0;
  let alto = n;
  while (baixo < alto) {
    const meio = (baixo + alto) >> 1;
    if (pontos[meio].posicao < alvo) baixo = meio + 1;
    else alto = meio;
  }
  let k: number;
  if (baixo === 0) k = 0;
  else if (baixo === n) k = n - 1;
  else k = alvo - pontos[baixo - 1].posicao <= pontos[baixo].posicao - alvo ? baixo - 1 : baixo;
  // pontos na mesma posição: o primeiro deles
  while (k > 0 && pontos[k - 1].posicao === pontos[k].posicao) k -= 1;
  return k;
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
