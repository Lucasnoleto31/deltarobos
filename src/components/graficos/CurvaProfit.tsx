"use client";

// O desenho da curva no estilo do Gráfico de Patrimônio do Relatório de Performance do Profit, trazido
// do Zeve Hub (17/09/2026, pedido do Artur: "o gráfico de performance pode ser estilo profit (por
// operação, por dia) e as cores; vc fez no hub então é aquele estilo"). As cores foram medidas pixel a
// pixel em prints do Profit (central de ajuda da Nelogica, 13/09/2026, e o Profit do Artur agrupado por
// dia, 14/09/2026) e valem nos dois temas do site, como no Hub. Aqui só se desenha: cada ponto chega
// com a posição, o acumulado, o drawdown e a dica já montados.

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Dica, passo, type ConteudoDaDica } from "./base";

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
  separador: "#505050",
} as const;

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
  dica: ConteudoDaDica;
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
}

/**
 * Linha com área em degradê até o zero, verde acima e vermelha abaixo, e o drawdown em barras no mesmo
 * eixo de tempo. Apontar mostra a dica e o valor no eixo; com `aoSelecionar`, arrastar com o mouse
 * marca um trecho para dar zoom (18/09/2026, "os gráficos são pouco interativos").
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
}: Props) {
  const [ativo, setAtivo] = useState<number | null>(null);
  // trecho sendo arrastado, em frações do eixo; só com mouse, para não brigar com a rolagem no toque
  const [selecao, setSelecao] = useState<{ de: number; ate: number } | null>(null);
  const inicioDoArrasto = useRef<number | null>(null);
  // a seleção também numa ref: o soltar pode vir antes do React redesenhar o último arrasto
  const selecaoRef = useRef<{ de: number; ate: number } | null>(null);
  const n = pontos.length;
  if (n === 0) return null;

  const x = (i: number) => pontos[i].posicao * 100;
  const { marcas, y } = escalaDaCurva(escalaDe ?? pontos.map((p) => p.acumulado));
  const zero = y(0);
  // a linha nasce no zero, na borda esquerda, antes do primeiro ponto
  const tracado = `M0,${zero.toFixed(2)}${pontos.map((p, i) => `L${x(i).toFixed(2)},${y(p.acumulado).toFixed(2)}`).join("")}`;
  const area = `${tracado}L${x(n - 1).toFixed(2)},${zero.toFixed(2)}Z`;
  const topoDaCurva = y(Math.max(0, ...pontos.map((p) => p.acumulado)));
  const fundoDaCurva = y(Math.min(0, ...pontos.map((p) => p.acumulado)));
  const escalaDD = escalaDoDrawdown(pontos.map((p) => p.drawdown));
  const larguraDaBarra = Math.min((100 / n) * 0.72, 3);
  const comDrawdown = alturaDoDrawdown > 0;

  const apontar = (e: ReactPointerEvent<HTMLDivElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    const fracao = (e.clientX - caixa.left) / (caixa.width || 1);
    // o ponto mais perto do dedo: com as operações espalhadas dentro de cada dia, o passo entre pontos não é fixo
    let perto = 0;
    pontos.forEach((p, i) => {
      if (Math.abs(p.posicao - fracao) < Math.abs(pontos[perto].posicao - fracao)) perto = i;
    });
    setAtivo(perto);
  };
  // o índice apontado pode ter ficado de uma série mais longa (troca de período com o ponteiro parado)
  const atual = ativo !== null && ativo < n ? pontos[ativo] : null;

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
      className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2"
      onPointerLeave={() => setAtivo(null)}
    >
      <div
        className={`relative touch-pan-y ${aoSelecionar ? "cursor-crosshair" : ""}`}
        style={{ height: altura }}
        onPointerMove={arrastar}
        onPointerDown={comecarArrasto}
        onPointerUp={soltar}
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
        {atual && ativo !== null && ativo < n ? (
          <>
            <div aria-hidden className="absolute inset-y-0 border-l border-dashed" style={{ left: `${x(ativo)}%`, borderColor: PROFIT.textoFraco }} />
            <span
              aria-hidden
              className="absolute right-0 -translate-y-1/2 rounded-[3px] px-1.5 py-0.5 text-[11px] font-medium tabular-nums"
              style={{ top: `${y(atual.acumulado)}%`, background: atual.acumulado >= 0 ? cores.alta : cores.baixa, color: PROFIT.fundo }}
            >
              {formatarEixo(atual.acumulado)}
            </span>
            <div
              aria-hidden
              className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${x(ativo)}%`, top: `${y(atual.acumulado)}%`, background: atual.acumulado >= 0 ? cores.alta : cores.baixa }}
            />
            <Dica conteudo={atual.dica} emPct={x(ativo)} />
          </>
        ) : null}
      </div>
      <EixoProfit marcas={marcas} y={y} altura={altura} formatar={formatarEixo} />
      <RotuloVertical altura={altura}>{rotuloVertical}</RotuloVertical>

      {comDrawdown ? (
        <>
          <div
            className="relative mt-4 touch-pan-y border-t"
            style={{ height: alturaDoDrawdown, borderColor: PROFIT.zero }}
            onPointerMove={apontar}
            onPointerDown={apontar}
          >
            {escalaDD.marcas
              .filter((m) => m !== 0)
              .map((m) => (
                <div key={m} aria-hidden className="absolute inset-x-0 border-t" style={{ top: `${escalaDD.y(m)}%`, borderColor: PROFIT.grade }} />
              ))}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
              {pontos.map((p, i) =>
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
              )}
            </svg>
            {atual && ativo !== null ? (
              <div aria-hidden className="absolute inset-y-0 border-l border-dashed" style={{ left: `${x(ativo)}%`, borderColor: PROFIT.textoFraco }} />
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
      </div>
      <div />
      <div />
    </div>
  );
}

/** A moldura grafite do Profit: título centralizado em cima, legenda embaixo do gráfico e, quando há, as abas no rodapé. */
export function MolduraProfit({
  titulo,
  legenda,
  abas,
  children,
}: {
  titulo: string;
  legenda?: React.ReactNode;
  abas?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg" style={{ background: PROFIT.fundo }}>
      <p className="px-4 pt-3 pb-2 text-center text-xs font-semibold" style={{ color: PROFIT.titulo }}>
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
