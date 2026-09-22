"use client";

// O desenho da curva no estilo do Gráfico de Patrimônio do Relatório de Performance do Profit, trazido
// do Zeve Hub (17/09/2026, pedido do Artur: "o gráfico de performance pode ser estilo profit (por
// operação, por dia) e as cores; vc fez no hub então é aquele estilo"). As cores foram medidas pixel a
// pixel em prints do Profit (central de ajuda da Nelogica, 13/09/2026, e o Profit do Artur agrupado por
// dia, 14/09/2026) e valem nos dois temas do site, como no Hub. Aqui só se desenha: cada ponto chega
// com a posição, o acumulado, o drawdown e a leitura já montados.

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Leitura, indiceMaisPerto, passo, type ConteudoDaDica, type PaletaDaLeitura } from "./base";

export const PROFIT = {
  fundo: "#222222",
  grade: "#383838",
  zero: "#4d4d4d",
  alta: "#22e57d",
  baixa: "#ff5858",
  texto: "#aaaaaa",
  textoFraco: "#909090",
  titulo: "#ffffff",
  abas: "#333333",
  abasBorda: "#444444",
  abaAtiva: "#4a4a4a",
  abaTexto: "#b3b3b3",
  // o separador medido (#505050) saiu em 19/09/2026: 1,57:1 sobre as abas; o "|" usa o textoFraco
} as const;

/** A leitura do ponto no alto da moldura, com as cores do Profit: a moldura é grafite nos dois temas. */
const PALETA_DA_LEITURA: PaletaDaLeitura = {
  titulo: PROFIT.titulo,
  texto: PROFIT.texto,
  rotulo: PROFIT.textoFraco,
  positivo: PROFIT.alta,
  negativo: PROFIT.baixa,
};

/** Texto grafite ou branco sobre a etiqueta, o que der mais contraste com a cor dela (o vermelho do por dia pede branco). */
function textoSobre(cor: string): string {
  const [r, g, b] = [1, 3, 5].map((k) => {
    const c = parseInt(cor.slice(k, k + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // luminância do grafite #222222: 0,016
  return (l + 0.05) / 0.066 >= 1.05 / (l + 0.05) ? PROFIT.fundo : PROFIT.titulo;
}

/** Linha e área da curva: cada agrupamento com as cores do gráfico do Profit no mesmo agrupamento. */
export interface CoresDaCurva {
  alta: string;
  baixa: string;
  linha: number;
  areaTopo: number;
  areaZero: number;
  zero: string;
  zeroLargura: number;
}

/** Por operação: as do print da central de ajuda da Nelogica. */
export const CURVA_POR_OPERACAO: CoresDaCurva = {
  alta: PROFIT.alta,
  baixa: PROFIT.baixa,
  linha: 1.5,
  areaTopo: 0.26,
  areaZero: 0.04,
  zero: PROFIT.zero,
  zeroLargura: 2,
};

/** Por dia: linha #00bb00 de 2 px e área mais forte, medidas no Profit do Artur agrupado por dia. */
export const CURVA_POR_DIA: CoresDaCurva = {
  alta: "#00bb00",
  baixa: "#bb0000",
  linha: 2,
  areaTopo: 0.39,
  areaZero: 0.05,
  zero: PROFIT.grade,
  zeroLargura: 1,
};

export interface PontoDoDesenho {
  /** de 0 a 1 no eixo de baixo */
  posicao: number;
  acumulado: number;
  /** distância até o pico anterior, sempre <= 0 */
  drawdown: number;
  /** a leitura do ponto, na linha fixa no alto da moldura */
  dica: ConteudoDaDica;
  /** o que a etiqueta do eixo de baixo diz na mira: a data, a hora ou a ordem da operação */
  eixo?: string;
}

/** Um ponto marcado em cima da curva (o MEP e o MEN do dia, por exemplo), com um rótulo curto ao lado. */
export interface MarcadorDaCurva {
  /** de 0 a 1 no eixo de baixo, na mesma régua dos pontos */
  posicao: number;
  /** o valor no eixo vertical, na mesma unidade do acumulado */
  valor: number;
  /** curto, cabe ao lado do ponto: "MEP", "MEN" */
  rotulo: string;
  tom: "positivo" | "negativo";
}

/** Escala da curva: só 5% além do maior valor e, quando passa abaixo do zero, 5% abaixo do menor. */
function escalaDaCurva(valores: number[]) {
  const max = valores.reduce((m, v) => Math.max(m, v), 0);
  const min = valores.reduce((m, v) => Math.min(m, v), 0);
  const amplitude = max - min || 1;
  const p = passo(amplitude, 5);
  const topo = max + amplitude * 0.05;
  const fundo = min < 0 ? min - amplitude * 0.05 : 0;
  const marcas: number[] = [];
  for (let v = Math.ceil(fundo / p) * p; v <= topo; v += p) marcas.push(Math.round(v * 100) / 100 || 0);
  return { marcas, y: (v: number) => ((topo - v) / (topo - fundo)) * 100 };
}

/** Escala das barras do drawdown: do zero até o pior valor arredondado para baixo. */
function escalaDoDrawdown(quedas: number[]) {
  const pior = quedas.reduce((m, q) => Math.min(m, q), 0);
  const p = passo(Math.abs(pior) || 1, 3);
  const fundo = Math.min(-p, Math.floor(pior / p) * p);
  const marcas: number[] = [];
  for (let v = 0; v >= fundo - p / 2; v -= p) marcas.push(Math.round(v * 100) / 100 || 0);
  return { marcas, y: (v: number) => (v / fundo) * 100 };
}

/** Acima disso o drawdown deixa de ser uma barra por ponto (um nó de SVG cada) e vira uma área só. */
export const MAX_BARRAS = 600;

/**
 * A área do drawdown de uma série longa (22/09/2026, com a série por operação de até 20 mil pontos):
 * do zero, no alto, até o drawdown de cada ponto, na cor das barras. Coordenadas em % do desenho; o x
 * vai com três casas porque 20 mil pontos em 100 unidades ficam a 0,005 um do outro.
 */
export function caminhoDoDrawdown(pontos: readonly PontoDoDesenho[], y: (drawdown: number) => number): string {
  const n = pontos.length;
  if (n === 0) return "";
  const x = (p: PontoDoDesenho) => (p.posicao * 100).toFixed(3);
  let d = `M${x(pontos[0])},0`;
  for (const p of pontos) d += `L${x(p)},${y(p.drawdown).toFixed(2)}`;
  return `${d}L${x(pontos[n - 1])},0Z`;
}

const SEM_MARCADORES: readonly MarcadorDaCurva[] = [];

function EixoProfit({ marcas, y, altura, formatar }: { marcas: number[]; y: (v: number) => number; altura: number; formatar: (v: number) => string }) {
  return (
    <div aria-hidden className="relative text-[11px] tabular-nums" style={{ height: altura, color: PROFIT.texto }}>
      {marcas.map((m) => (
        <span key={m} className="invisible block h-0 leading-none whitespace-nowrap">
          {formatar(m)}
        </span>
      ))}
      {marcas.map((m) => (
        <span key={m} className="absolute left-0 -translate-y-1/2 leading-none whitespace-nowrap" style={{ top: `${y(m)}%` }}>
          {formatar(m)}
        </span>
      ))}
    </div>
  );
}

/** A etiqueta no eixo da direita, na altura do valor; encosta no desenho, como a do Profit. */
function EtiquetaDoEixo({ topo, fundo, children }: { topo: number; fundo: string; children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="absolute -left-1 -translate-y-1/2 rounded-[3px] px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap tabular-nums"
      style={{ top: `${topo}%`, background: fundo, color: textoSobre(fundo) }}
    >
      {children}
    </span>
  );
}

function RotuloVertical({ altura, children }: { altura: number; children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      className="flex items-center justify-center overflow-hidden text-[10px] whitespace-nowrap max-sm:w-0"
      style={{ height: altura, color: PROFIT.textoFraco, writingMode: "vertical-rl", transform: "rotate(180deg)" }}
    >
      {children}
    </div>
  );
}

interface Props {
  id: string;
  pontos: PontoDoDesenho[];
  /** valores que dimensionam a escala; sem eles, os próprios pontos (os dois agrupamentos dividem a mesma) */
  escalaDe?: number[];
  cores: CoresDaCurva;
  altura: number;
  /** altura das barras do drawdown embaixo; 0 esconde */
  alturaDoDrawdown?: number;
  rotulosX: Array<{ x: number; rotulo: string }>;
  formatarEixo: (v: number) => string;
  rotuloVertical: string;
  rotuloAria: string;
  /** arrastar com o mouse seleciona um trecho (frações de 0 a 1 do eixo) e chama isto */
  aoSelecionar?: (de: number, ate: number) => void;
  /** pontos marcados em cima da curva, com rótulo; entram na escala vertical para nunca ficarem fora do desenho */
  marcadores?: ReadonlyArray<MarcadorDaCurva>;
}

/**
 * Linha com área em degradê até o zero, verde acima e vermelha abaixo, e o drawdown em barras no mesmo
 * eixo de tempo. Com `aoSelecionar`, arrastar com o mouse marca um trecho para dar zoom (18/09/2026,
 * "os gráficos são pouco interativos").
 *
 * Apontar, desde 19/09/2026, é como no Profit ("esses gráficos consegue deixar estilo do profit?"):
 * mira em cruz tracejada no ponto, a etiqueta do valor no eixo da direita e a da data (ou da hora, ou
 * da ordem) no eixo de baixo, e a leitura do ponto numa linha fixa no alto da moldura. Sem o ponteiro,
 * a linha mostra o último ponto e a etiqueta colorida do último valor fica sempre no eixo: o resultado
 * não some mais debaixo da dica. No toque, arrastar o dedo move a mira, e ela fica onde o dedo soltou.
 */
export function DesenhoDaCurva({
  id,
  pontos,
  escalaDe,
  cores,
  altura,
  alturaDoDrawdown = 0,
  rotulosX,
  formatarEixo,
  rotuloVertical,
  rotuloAria,
  aoSelecionar,
  marcadores = SEM_MARCADORES,
}: Props) {
  // Onde o ponteiro está, em fração do eixo; o ponto apontado é o mais perto dela, achado a cada
  // desenho (busca binária, custo nulo). Guardar a fração em vez do índice (22/09/2026) é o que deixa
  // trocar a lista de pontos sem remontar: quando a série completa chega no lugar da leve, ou o zoom
  // muda, a mira vai para o ponto novo mais perto do ponteiro em vez de sumir ou apontar outro ponto.
  const [alvo, setAlvo] = useState<number | null>(null);
  // trecho sendo arrastado, em frações do eixo; só com mouse, para não brigar com a rolagem no toque
  const [selecao, setSelecao] = useState<{ de: number; ate: number } | null>(null);
  const inicioDoArrasto = useRef<number | null>(null);
  // a seleção também numa ref: o soltar pode vir antes do React redesenhar o último arrasto
  const selecaoRef = useRef<{ de: number; ate: number } | null>(null);
  const n = pontos.length;

  // O que não muda ao apontar fica montado uma vez (22/09/2026): com a série por operação de até 20 mil
  // pontos, refazer o traçado, a escala e a etiqueta mais larga a cada movimento do ponteiro travava a mira.
  const desenho = useMemo(() => {
    if (n === 0) return null;
    const x = (i: number) => pontos[i].posicao * 100;
    // os marcadores entram na escala: em série fatiada o pico real pode não estar entre os pontos desenhados
    const { marcas, y } = escalaDaCurva([...(escalaDe ?? pontos.map((p) => p.acumulado)), ...marcadores.map((m) => m.valor)]);
    const zero = y(0);
    // com muitos pontos o x leva uma casa a mais: 20 mil pontos em 100 unidades ficam a 0,005 um do outro
    const casas = n > MAX_BARRAS ? 3 : 2;
    // a linha nasce no zero, na borda esquerda, antes do primeiro ponto
    let tracado = `M0,${zero.toFixed(2)}`;
    let maior = 0;
    let menor = 0;
    // a coluna do eixo reserva a largura da etiqueta mais larga, para ela não invadir o rótulo vertical
    let etiquetaMaisLarga = "";
    for (let i = 0; i < n; i++) {
      const p = pontos[i];
      tracado += `L${x(i).toFixed(casas)},${y(p.acumulado).toFixed(2)}`;
      if (p.acumulado > maior) maior = p.acumulado;
      if (p.acumulado < menor) menor = p.acumulado;
      const t = formatarEixo(p.acumulado);
      if (t.length > etiquetaMaisLarga.length) etiquetaMaisLarga = t;
    }
    const escalaDD = escalaDoDrawdown(pontos.map((p) => p.drawdown));
    return {
      x,
      marcas,
      y,
      zero,
      tracado,
      area: `${tracado}L${x(n - 1).toFixed(casas)},${zero.toFixed(2)}Z`,
      topoDaCurva: y(maior),
      fundoDaCurva: y(menor),
      escalaDD,
      larguraDaBarra: Math.min((100 / n) * 0.72, 3),
      // acima de MAX_BARRAS o drawdown é uma área só; abaixo, as barras de sempre
      areaDoDrawdown: n > MAX_BARRAS ? caminhoDoDrawdown(pontos, escalaDD.y) : null,
      etiquetaMaisLarga,
    };
  }, [pontos, n, escalaDe, marcadores, formatarEixo]);
  if (n === 0 || desenho === null) return null;

  const { x, marcas, y, zero, tracado, area, topoDaCurva, fundoDaCurva, escalaDD, larguraDaBarra, areaDoDrawdown, etiquetaMaisLarga } = desenho;
  const comDrawdown = alturaDoDrawdown > 0;

  const apontar = (e: ReactPointerEvent<HTMLDivElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    setAlvo((e.clientX - caixa.left) / (caixa.width || 1));
  };
  // o ponto mais perto do ponteiro: com as operações espalhadas dentro de cada dia, o passo entre pontos não
  // é fixo; como eles vêm em ordem de posição, a busca é binária
  const ativo = alvo === null ? null : indiceMaisPerto(pontos, alvo);
  const atual = ativo !== null ? pontos[ativo] : null;
  const ultimo = pontos[n - 1];
  const corDoValor = (v: number) => (v >= 0 ? cores.alta : cores.baixa);

  const fracaoDe = (e: ReactPointerEvent<HTMLDivElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - caixa.left) / (caixa.width || 1)));
  };
  const comecarArrasto = (e: ReactPointerEvent<HTMLDivElement>) => {
    apontar(e);
    if (!aoSelecionar || e.pointerType !== "mouse") return;
    inicioDoArrasto.current = fracaoDe(e);
    selecaoRef.current = null;
    setSelecao(null);
  };
  const arrastar = (e: ReactPointerEvent<HTMLDivElement>) => {
    apontar(e);
    if (inicioDoArrasto.current === null) return;
    const f = fracaoDe(e);
    const nova = { de: Math.min(inicioDoArrasto.current, f), ate: Math.max(inicioDoArrasto.current, f) };
    selecaoRef.current = nova;
    setSelecao(nova);
  };
  const soltar = () => {
    const sel = selecaoRef.current;
    inicioDoArrasto.current = null;
    selecaoRef.current = null;
    setSelecao(null);
    if (sel && aoSelecionar && sel.ate - sel.de > 0.02) aoSelecionar(sel.de, sel.ate);
  };

  return (
    <div
      role="img"
      aria-label={rotuloAria}
      className="@container grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2"
      // no toque o "sair" vem logo depois de soltar o dedo: a mira fica onde ele parou
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") setAlvo(null);
      }}
    >
      {/* a altura reservada acompanha a largura (uma linha no largo, três no celular), para o desenho não pular */}
      <Leitura
        conteudo={(atual ?? ultimo).dica}
        paleta={PALETA_DA_LEITURA}
        className="col-span-3 mb-2 min-h-[52px] @md:min-h-[34px] @3xl:min-h-4"
      />
      <div
        className={`relative touch-pan-y ${aoSelecionar ? "cursor-crosshair" : ""}`}
        style={{ height: altura }}
        onPointerMove={arrastar}
        onPointerDown={comecarArrasto}
        onPointerUp={soltar}
        onPointerCancel={() => setAlvo(null)}
      >
        {marcas
          .filter((m) => m !== 0)
          .map((m) => (
            <div key={m} aria-hidden className="absolute inset-x-0 border-t" style={{ top: `${y(m)}%`, borderColor: PROFIT.grade }} />
          ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <defs>
            <clipPath id={`${id}-acima`}>
              <rect x="0" y="0" width="100" height={Math.max(0, zero)} />
            </clipPath>
            <clipPath id={`${id}-abaixo`}>
              <rect x="0" y={Math.max(0, zero)} width="100" height={Math.max(0, 100 - zero)} />
            </clipPath>
            <linearGradient id={`${id}-alta`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={topoDaCurva} y2={zero}>
              <stop offset="0" stopColor={cores.alta} stopOpacity={cores.areaTopo} />
              <stop offset="1" stopColor={cores.alta} stopOpacity={cores.areaZero} />
            </linearGradient>
            <linearGradient id={`${id}-baixa`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={zero} y2={fundoDaCurva}>
              <stop offset="0" stopColor={cores.baixa} stopOpacity={cores.areaZero} />
              <stop offset="1" stopColor={cores.baixa} stopOpacity={cores.areaTopo} />
            </linearGradient>
          </defs>
          <line x1="0" x2="100" y1={zero} y2={zero} stroke={cores.zero} strokeWidth={cores.zeroLargura} vectorEffect="non-scaling-stroke" />
          <path d={area} fill={`url(#${id}-alta)`} clipPath={`url(#${id}-acima)`} />
          <path d={area} fill={`url(#${id}-baixa)`} clipPath={`url(#${id}-abaixo)`} />
          <path d={tracado} fill="none" stroke={cores.alta} strokeWidth={cores.linha} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" clipPath={`url(#${id}-acima)`} />
          <path d={tracado} fill="none" stroke={cores.baixa} strokeWidth={cores.linha} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" clipPath={`url(#${id}-abaixo)`} />
        </svg>
        {selecao ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 border-x"
            style={{ left: `${selecao.de * 100}%`, width: `${(selecao.ate - selecao.de) * 100}%`, background: "rgba(255,255,255,0.08)", borderColor: PROFIT.textoFraco }}
          />
        ) : null}
        {/* Marcadores em HTML, como o ponto ativo: dentro do SVG esticado o círculo viraria uma elipse. Ficam antes
            do ponto ativo no DOM para nunca cobrirem o ponto ativo, e o círculo some quando o hover cai no ponto
            desenhado mais perto dele (em série fatiada o marcador pode não coincidir com nenhum ponto). O rótulo
            vira para dentro perto da borda direita para não invadir o eixo, e fica do lado oposto ao da linha:
            num pico a linha só desce, então o rótulo vai para cima; num vale só sobe, então vai para baixo. */}
        {marcadores.map((m, i) => {
          const px = m.posicao * 100;
          const cor = m.tom === "positivo" ? cores.alta : cores.baixa;
          const sobOAtivo = ativo === indiceMaisPerto(pontos, m.posicao);
          return (
            <div key={`${m.rotulo}-${i}`} aria-hidden className="pointer-events-none absolute" style={{ left: `${px}%`, top: `${y(m.valor)}%` }}>
              {sobOAtivo ? null : (
                <div
                  className="absolute top-0 left-0 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ background: cor, boxShadow: `0 0 0 1.5px ${PROFIT.fundo}` }}
                />
              )}
              <span
                className={`absolute text-[10px] leading-none font-semibold whitespace-nowrap ${m.tom === "positivo" ? "bottom-px" : "top-px"} ${px > 85 ? "right-2" : "left-2"}`}
                style={{ color: cor }}
              >
                {m.rotulo}
              </span>
            </div>
          );
        })}
        {/* a mira em cruz do Profit: as duas linhas tracejadas finas se cruzam no ponto */}
        {atual && ativo !== null ? (
          <>
            <div aria-hidden className="pointer-events-none absolute inset-y-0 border-l border-dashed" style={{ left: `${x(ativo)}%`, borderColor: PROFIT.textoFraco }} />
            <div aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed" style={{ top: `${y(atual.acumulado)}%`, borderColor: PROFIT.textoFraco }} />
            <div
              aria-hidden
              className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${x(ativo)}%`, top: `${y(atual.acumulado)}%`, background: corDoValor(atual.acumulado) }}
            />
          </>
        ) : null}
      </div>
      {/* no eixo, a etiqueta colorida do último valor fica sempre; a da mira, cinza, vem por cima quando se aponta */}
      <div className="relative">
        <EixoProfit marcas={marcas} y={y} altura={altura} formatar={formatarEixo} />
        <span aria-hidden className="invisible block h-0 overflow-hidden px-1.5 text-[11px] font-medium whitespace-nowrap tabular-nums">
          {etiquetaMaisLarga}
        </span>
        <EtiquetaDoEixo topo={y(ultimo.acumulado)} fundo={corDoValor(ultimo.acumulado)}>
          {formatarEixo(ultimo.acumulado)}
        </EtiquetaDoEixo>
        {atual ? (
          <EtiquetaDoEixo topo={y(atual.acumulado)} fundo={PROFIT.abaAtiva}>
            {formatarEixo(atual.acumulado)}
          </EtiquetaDoEixo>
        ) : null}
      </div>
      <RotuloVertical altura={altura}>{rotuloVertical}</RotuloVertical>

      {comDrawdown ? (
        <>
          <div
            className="relative mt-4 touch-pan-y border-t"
            style={{ height: alturaDoDrawdown, borderColor: PROFIT.zero }}
            onPointerMove={apontar}
            onPointerDown={apontar}
            onPointerCancel={() => setAlvo(null)}
          >
            {escalaDD.marcas
              .filter((m) => m !== 0)
              .map((m) => (
                <div key={m} aria-hidden className="absolute inset-x-0 border-t" style={{ top: `${escalaDD.y(m)}%`, borderColor: PROFIT.grade }} />
              ))}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
              {/* série longa: uma área só do zero até o drawdown de cada ponto (a mira tracejada marca o apontado);
                  série curta: uma barra por ponto, a apontada mais forte */}
              {areaDoDrawdown !== null ? (
                <path d={areaDoDrawdown} fill={PROFIT.baixa} fillOpacity={0.62} />
              ) : (
                pontos.map((p, i) =>
                  p.drawdown < 0 ? (
                    <rect
                      key={i}
                      x={(x(i) - larguraDaBarra / 2).toFixed(3)}
                      y="0"
                      width={larguraDaBarra.toFixed(3)}
                      height={escalaDD.y(p.drawdown).toFixed(2)}
                      fill={PROFIT.baixa}
                      fillOpacity={atual && ativo === i ? 0.95 : 0.62}
                    />
                  ) : null,
                )
              )}
            </svg>
            {atual && ativo !== null ? (
              <div aria-hidden className="pointer-events-none absolute inset-y-0 border-l border-dashed" style={{ left: `${x(ativo)}%`, borderColor: PROFIT.textoFraco }} />
            ) : null}
          </div>
          <div className="mt-4">
            <EixoProfit marcas={escalaDD.marcas} y={escalaDD.y} altura={alturaDoDrawdown} formatar={formatarEixo} />
          </div>
          <div className="mt-4">
            <RotuloVertical altura={alturaDoDrawdown}>Drawdown</RotuloVertical>
          </div>
        </>
      ) : null}

      <div aria-hidden className="relative mt-1.5 h-4 text-[11px] tabular-nums" style={{ color: PROFIT.texto }}>
        {rotulosX.map((m, i) => (
          <span
            key={m.x}
            className={`absolute whitespace-nowrap ${i % 2 === 1 ? "max-sm:hidden" : ""}`}
            style={{ left: `${m.x}%`, transform: m.x < 4 ? "none" : "translateX(-50%)" }}
          >
            {m.rotulo}
          </span>
        ))}
        {/* a etiqueta da mira no eixo de baixo; o deslocamento proporcional mantém a caixa dentro do desenho nas pontas */}
        {atual?.eixo && ativo !== null ? (
          <span
            className="absolute -top-0.5 rounded-[3px] px-1.5 py-0.5 font-medium whitespace-nowrap"
            style={{ left: `${x(ativo)}%`, transform: `translateX(-${x(ativo)}%)`, background: PROFIT.abaAtiva, color: PROFIT.titulo }}
          >
            {atual.eixo}
          </span>
        ) : null}
      </div>
      <div />
      <div />
    </div>
  );
}

/**
 * A moldura grafite do Profit: título centralizado em cima, legenda embaixo do gráfico e, quando há, as abas no rodapé.
 * O título pode trazer o i do "o que é" (19/09/2026, RotuloComInfo). O i vem com as cores do tema, e o cinza
 * dele no tema claro some no grafite; aqui ele usa as da moldura: textoFraco (5:1 sobre o fundo) e branco ao
 * passar o mouse, no foco e aberto.
 */
export function MolduraProfit({
  titulo,
  legenda,
  abas,
  children,
}: {
  titulo: React.ReactNode;
  legenda?: React.ReactNode;
  abas?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg" style={{ background: PROFIT.fundo }}>
      <p
        className="px-4 pt-3 pb-2 text-center text-xs font-semibold [&_button]:text-(--moldura-i)! [&_button:focus-visible]:text-(--moldura-titulo)! [&_button:hover]:text-(--moldura-titulo)! [&_button[data-popup-open]]:text-(--moldura-titulo)!"
        style={{ color: PROFIT.titulo, "--moldura-i": PROFIT.textoFraco, "--moldura-titulo": PROFIT.titulo } as React.CSSProperties}
      >
        {titulo}
      </p>
      <div className="px-3">{children}</div>
      {legenda ? (
        <div aria-hidden className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 py-2 text-[11px]" style={{ color: PROFIT.textoFraco }}>
          {legenda}
        </div>
      ) : (
        <div className="h-3" />
      )}
      {abas}
    </div>
  );
}

/** O risquinho verde e vermelho da legenda, com as cores do agrupamento. */
export function AmostraDaLinha({ cores }: { cores: CoresDaCurva }) {
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <polyline points="1,4 4,8 7,5" stroke={cores.baixa} />
      <polyline points="7,5 10,2 12,4 15,1" stroke={cores.alta} />
    </svg>
  );
}
