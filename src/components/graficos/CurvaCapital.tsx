"use client";

import { useId, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarBRL, formatarData, formatarDataCurta, formatarPontos } from "@/lib/formato";
import { curvaAcumulada, drawdownMaximo } from "@/lib/stats/serie";
import type { LinhaDiaria, OpcoesSerie, PontoCurva } from "@/lib/stats/tipos";
import { Dica, Eixo, mistura, passo, tomDe, type ConteudoDaDica } from "./base";

interface Props {
  /** série já filtrada pelo período desejado */
  linhas: readonly LinhaDiaria[];
  opcoes: OpcoesSerie;
  altura?: number;
  mostrarResumo?: boolean;
}

// acima disso a barra do drawdown viraria um fio de menos de 3 px: cada fatia vira uma coluna
const MAX_COLUNAS = 240;

interface Ponto {
  /** dia do ponto (o último, quando é uma fatia) */
  dia: string;
  /** primeiro dia da fatia; igual a `dia` quando o ponto é um dia só */
  desde: string;
  valor: number;
  acumulado: number;
  drawdown: number;
  dias: number;
  /** de 0 a 1 no eixo de tempo */
  posicao: number;
}

/**
 * Os pontos do desenho. O acumulado e o drawdown vêm prontos de `curvaAcumulada`; aqui só se escolhe
 * onde cada um cai no eixo. Com dias demais (a curva da casa tem quase dois mil), cada fatia fica com o
 * acumulado do fim, o pior drawdown e o resultado somado do trecho.
 */
function pontosDoDesenho(curva: readonly PontoCurva[]): Ponto[] {
  const n = curva.length;
  const todos: Ponto[] = curva.map((p, i) => ({
    dia: p.dia,
    desde: p.dia,
    valor: p.valor,
    acumulado: p.acumulado,
    drawdown: p.drawdown,
    dias: 1,
    posicao: (i + 1) / n,
  }));
  if (n <= MAX_COLUNAS) return todos;
  const tamanho = n / MAX_COLUNAS;
  return Array.from({ length: MAX_COLUNAS }, (_, k) => {
    const de = Math.floor(k * tamanho);
    const fatia = todos.slice(de, Math.max(de + 1, Math.floor((k + 1) * tamanho)));
    const ultimo = fatia[fatia.length - 1];
    return {
      dia: ultimo.dia,
      desde: fatia[0].dia,
      valor: fatia.reduce((s, p) => s + p.valor, 0),
      acumulado: ultimo.acumulado,
      drawdown: fatia.reduce((m, p) => Math.min(m, p.drawdown), 0),
      dias: fatia.length,
      posicao: ultimo.posicao,
    };
  });
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

/** Datas espaçadas por igual no eixo de baixo: cada rótulo é o dia do último ponto até ali. */
function marcasDeData(pontos: Ponto[], quantas = 8): Array<{ x: number; rotulo: string }> {
  if (pontos.length === 0) return [];
  const dias = (new Date(pontos[pontos.length - 1].dia).getTime() - new Date(pontos[0].desde).getTime()) / 86_400_000;
  // período longo: mês e ano ("09/26"); "12/09" sozinho não diz de que ano é
  const rotular = (dia: string) => (dias > 400 ? `${dia.slice(5, 7)}/${dia.slice(2, 4)}` : formatarDataCurta(dia));
  const marcas = Array.from({ length: quantas }, (_, i) => {
    const f = i / quantas;
    const ponto = [...pontos].reverse().find((p) => p.posicao <= f + 1e-9) ?? pontos[0];
    return { x: f * 100, rotulo: rotular(ponto.dia) };
  });
  return marcas.filter((m, i) => i === 0 || m.rotulo !== marcas[i - 1].rotulo);
}

/**
 * Curva de capital acumulada por contrato, com o drawdown em barras embaixo, no mesmo eixo de tempo.
 * Desde 17/09/2026 no desenho do Zeve Hub (era lightweight-charts): SVG esticado com traço de
 * espessura fixa, verde acima do zero e vermelho abaixo, área em degradê até o zero, guias
 * pontilhadas e a dica em cartão com o dia, o acumulado e o drawdown. Quem controla período, unidade
 * e base é o pai; os números vêm de `curvaAcumulada` e `drawdownMaximo`, como antes.
 */
export function CurvaCapital({ linhas, opcoes, altura = 320, mostrarResumo = true }: Props) {
  const id = `curva-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [ativo, setAtivo] = useState<number | null>(null);

  const curva = useMemo(() => curvaAcumulada(linhas, opcoes), [linhas, opcoes]);
  const dd = useMemo(() => drawdownMaximo(curva), [curva]);
  const pontos = useMemo(() => pontosDoDesenho(curva), [curva]);
  const acumulado = curva.length > 0 ? curva[curva.length - 1].acumulado : 0;
  const unidade = opcoes.unidade;

  const alturaDaCurva = Math.round(altura * 0.68);
  const alturaDoDrawdown = Math.max(56, Math.round(altura * 0.26));

  const noEixo = (v: number) => (unidade === "brl" ? formatarBRL(v, { inteiro: true }) : formatarPontos(v));
  const naDica = (v: number) =>
    unidade === "brl" ? formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 }) : `${formatarPontos(v, true)} pts`;

  const n = pontos.length;
  const x = (i: number) => pontos[i].posicao * 100;
  const { marcas, y } = escalaDaCurva(pontos.map((p) => p.acumulado));
  const zero = y(0);
  // a linha nasce no zero, na borda esquerda, antes do primeiro dia
  const tracado = `M0,${zero.toFixed(2)}${pontos.map((p, i) => `L${x(i).toFixed(2)},${y(p.acumulado).toFixed(2)}`).join("")}`;
  const area = n > 0 ? `${tracado}L${x(n - 1).toFixed(2)},${zero.toFixed(2)}Z` : "";
  const topoDaCurva = y(Math.max(0, ...pontos.map((p) => p.acumulado)));
  const fundoDaCurva = y(Math.min(0, ...pontos.map((p) => p.acumulado)));
  const escalaDD = escalaDoDrawdown(pontos.map((p) => p.drawdown));
  const larguraDaBarra = n > 0 ? Math.min((100 / n) * 0.72, 3) : 0;
  const rotulos = marcasDeData(pontos);

  const apontar = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (n === 0) return;
    const caixa = e.currentTarget.getBoundingClientRect();
    const fracao = (e.clientX - caixa.left) / (caixa.width || 1);
    let perto = 0;
    pontos.forEach((p, i) => {
      if (Math.abs(p.posicao - fracao) < Math.abs(pontos[perto].posicao - fracao)) perto = i;
    });
    setAtivo(perto);
  };

  const atual = ativo !== null ? pontos[ativo] : null;
  const dicaDe = (p: Ponto): ConteudoDaDica => ({
    titulo: p.dias > 1 ? `${formatarData(p.desde)} a ${formatarData(p.dia)}` : formatarData(p.dia),
    subtitulo: p.dias > 1 ? `${p.dias} dias de pregão` : undefined,
    linhas: [
      { rotulo: p.dias > 1 ? "Neste trecho" : "No dia", valor: naDica(p.valor), tom: tomDe(p.valor) },
      { rotulo: "Acumulado", valor: naDica(p.acumulado), tom: tomDe(p.acumulado) },
      { rotulo: "Drawdown", valor: p.drawdown < 0 ? naDica(p.drawdown) : "no topo", tom: p.drawdown < 0 ? "negativo" : "neutro" },
    ],
  });

  return (
    <div className="flex flex-col gap-3">
      {mostrarResumo ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">No período</dt>
            <dd className="font-semibold">
              <Valor valor={acumulado} unidade={unidade} />
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">Drawdown máx.</dt>
            <dd className="font-semibold">
              <Valor valor={-dd.valor} unidade={unidade} />
              {dd.diasAteRecuperar !== null ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  recuperado em {dd.diasAteRecuperar} dias
                </span>
              ) : dd.valor > 0 ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground">em recuperação</span>
              ) : null}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">Dias</dt>
            <dd className="font-semibold tabular-nums">{curva.length}</dd>
          </div>
        </dl>
      ) : null}

      {n === 0 ? (
        <div className="grid place-items-center text-sm text-muted-foreground" style={{ height: altura }}>
          Sem operações no período.
        </div>
      ) : (
        <div
          role="img"
          aria-label="Resultado acumulado dia a dia, com o drawdown embaixo"
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2"
          onPointerLeave={() => setAtivo(null)}
        >
          {/* a curva */}
          <div className="relative touch-pan-y" style={{ height: alturaDaCurva }} onPointerMove={apontar} onPointerDown={apontar}>
            {marcas.map((m) => (
              <div
                key={m}
                aria-hidden
                className="absolute inset-x-0 border-t border-dotted"
                style={{ top: `${y(m)}%`, borderColor: mistura("--foreground", m === 0 ? 24 : 8) }}
              />
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
                  <stop offset="0" style={{ stopColor: "var(--positivo)" }} stopOpacity={0.3} />
                  <stop offset="1" style={{ stopColor: "var(--positivo)" }} stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id={`${id}-baixa`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={zero} y2={fundoDaCurva}>
                  <stop offset="0" style={{ stopColor: "var(--negativo)" }} stopOpacity={0.03} />
                  <stop offset="1" style={{ stopColor: "var(--negativo)" }} stopOpacity={0.3} />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#${id}-alta)`} clipPath={`url(#${id}-acima)`} />
              <path d={area} fill={`url(#${id}-baixa)`} clipPath={`url(#${id}-abaixo)`} />
              <path
                d={tracado}
                fill="none"
                style={{ stroke: "var(--positivo)" }}
                strokeWidth={1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                clipPath={`url(#${id}-acima)`}
              />
              <path
                d={tracado}
                fill="none"
                style={{ stroke: "var(--negativo)" }}
                strokeWidth={1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                clipPath={`url(#${id}-abaixo)`}
              />
            </svg>
            {atual && ativo !== null ? (
              <>
                <div
                  aria-hidden
                  className="absolute inset-y-0 border-l border-dashed"
                  style={{ left: `${x(ativo)}%`, borderColor: mistura("--foreground", 35) }}
                />
                <div
                  aria-hidden
                  className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${x(ativo)}%`,
                    top: `${y(atual.acumulado)}%`,
                    background: atual.acumulado >= 0 ? "var(--positivo)" : "var(--negativo)",
                  }}
                />
                <Dica conteudo={dicaDe(atual)} emPct={x(ativo)} />
              </>
            ) : null}
          </div>
          <Eixo marcas={marcas} y={y} altura={alturaDaCurva} formatar={noEixo} lado="direita" />

          {/* o drawdown, no mesmo eixo de tempo e com escala própria */}
          <div
            className="relative mt-4 touch-pan-y border-t"
            style={{ height: alturaDoDrawdown, borderColor: mistura("--foreground", 24) }}
            onPointerMove={apontar}
            onPointerDown={apontar}
          >
            {escalaDD.marcas
              .filter((m) => m !== 0)
              .map((m) => (
                <div
                  key={m}
                  aria-hidden
                  className="absolute inset-x-0 border-t border-dotted"
                  style={{ top: `${escalaDD.y(m)}%`, borderColor: mistura("--foreground", 8) }}
                />
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
                    style={{ fill: "var(--negativo)" }}
                    fillOpacity={ativo === i ? 0.95 : 0.6}
                  />
                ) : null,
              )}
            </svg>
            {ativo !== null ? (
              <div
                aria-hidden
                className="absolute inset-y-0 border-l border-dashed"
                style={{ left: `${x(ativo)}%`, borderColor: mistura("--foreground", 35) }}
              />
            ) : null}
          </div>
          <div className="mt-4">
            <Eixo marcas={escalaDD.marcas} y={escalaDD.y} altura={alturaDoDrawdown} formatar={noEixo} lado="direita" />
          </div>

          {/* datas */}
          <div aria-hidden className="relative mt-1.5 h-4 text-[11px] text-muted-foreground tabular-nums">
            {rotulos.map((m, i) => (
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
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Resultado acumulado por {opcoes.contratos ?? 1}{" "}
        {(opcoes.contratos ?? 1) === 1 ? "contrato" : "contratos"}, dia a dia. Embaixo, a distância
        até o pico anterior (drawdown).
      </p>
    </div>
  );
}
