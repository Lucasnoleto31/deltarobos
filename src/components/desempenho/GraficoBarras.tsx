"use client";

import { useEffect, useRef, useState } from "react";
import {
  Eixo,
  Guias,
  Leitura,
  escala,
  indiceApontado,
  mistura,
  tomDe,
  type ConteudoDaDica,
} from "@/components/graficos/base";
import { formatarBRL, formatarNumero, formatarPontos } from "@/lib/formato";
import type { Unidade } from "@/lib/stats/tipos";

export interface DadoBarra {
  rotulo: string;
  valor: number;
  n?: number;
  /** no histograma de contagem: a cor da faixa pelo sinal do resultado que ela agrupa */
  tom?: "positivo" | "negativo";
}

interface Props {
  dados: DadoBarra[];
  unidade: Unidade;
  altura?: number;
  /** barras sempre neutras (histograma de contagem) */
  contagem?: boolean;
  /** o que o `n` de cada barra conta. Padrão: operações (e aí a dica mostra também a média por operação) */
  rotuloN?: string;
  /** clicar numa barra chama isto com o índice dela (o cursor vira mão) */
  aoEscolher?: (indice: number) => void;
}

// a fileira de rótulos embaixo das barras entra na conta da altura pedida
const ALTURA_DOS_ROTULOS = 22;

/**
 * Barras verticais pelo sinal (mensal, dia da semana, hora, histograma). Desde a ficha Mesa (25/11/2026) a
 * barra é chapada, verde ou vermelha, sem gradiente e sem trilho (o trilho só acende sob o ponteiro), com
 * guias discretas e a mesma espessura em todo gráfico (64% da coluna, no máximo 48 px). A interface é a
 * mesma de antes (era Recharts): quem chama não mudou. Desde 19/09/2026 a leitura da barra apontada fica
 * numa linha fixa acima do gráfico, como nas curvas: o cartão flutuante cobria as barras vizinhas. Sem o
 * ponteiro, a linha lê a última barra. A leitura não traz mais a média por dia ou por operação: o iniciante
 * multiplica a média e lê como salário.
 */
export function GraficoBarras({ dados, unidade, altura = 220, contagem = false, rotuloN = "Operações", aoEscolher }: Props) {
  const [ativo, setAtivo] = useState<number | null>(null);
  // largura real da área das barras: é ela que diz quantos rótulos cabem embaixo sem se atropelar
  const areaRef = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const medir = () => setLargura(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [dados.length]);

  if (dados.length === 0) {
    return (
      <div className="grid place-items-center text-sm text-muted-foreground" style={{ height: altura }}>
        Sem dados no período.
      </div>
    );
  }

  const area = altura - ALTURA_DOS_ROTULOS;
  const { topo, fundo, marcas, y } = escala(dados.map((d) => d.valor));
  const zero = y(0);
  // Um rótulo a cada N colunas, pelo mais comprido deles: 6,2 px por caractere a 11 px, mais um respiro.
  // Antes de medir (primeira pintura), uns seis rótulos.
  const maisLongo = dados.reduce((m, d) => Math.max(m, d.rotulo.length), 1);
  const aCada =
    largura > 0
      ? Math.max(1, Math.ceil((maisLongo * 6.2 + 14) / (largura / dados.length)))
      : Math.max(1, Math.ceil(dados.length / 6));

  const noEixo = (v: number) =>
    contagem ? formatarNumero(v) : unidade === "brl" ? formatarBRL(v, { inteiro: true }) : formatarPontos(v);
  const naDica = (v: number) =>
    unidade === "brl" ? formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 }) : `${formatarPontos(v, true)} pts`;

  const dicaDe = (d: DadoBarra): ConteudoDaDica =>
    contagem
      ? { titulo: d.rotulo, linhas: [{ rotulo: "Operações", valor: formatarNumero(Math.round(d.valor)) }] }
      : {
          titulo: d.rotulo,
          linhas: [
            { rotulo: "Resultado", valor: naDica(d.valor), tom: tomDe(d.valor) },
            ...(d.n !== undefined ? [{ rotulo: rotuloN, valor: formatarNumero(d.n) }] : []),
          ],
        };

  const rotuloDoGrafico = contagem ? "Operações por faixa de resultado" : "Resultado por período";
  // o índice apontado pode ter ficado de uma lista mais longa (troca de período com o ponteiro parado)
  const lida = (ativo !== null ? dados[ativo] : undefined) ?? dados[dados.length - 1];

  return (
    <div role="img" aria-label={rotuloDoGrafico} className="@container grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-2">
      {/* a altura reservada acompanha a largura (duas linhas no estreito), para as barras não pularem */}
      <Leitura conteudo={dicaDe(lida)} className="col-span-2 mb-2 min-h-[34px] @xl:min-h-4" />
      <Eixo marcas={marcas} y={y} altura={area} formatar={noEixo} />
      <div
        ref={areaRef}
        className={`relative touch-pan-y ${aoEscolher ? "cursor-pointer" : ""}`}
        style={{ height: area }}
        onPointerMove={(e) => setAtivo(indiceApontado(e, dados.length))}
        onPointerDown={(e) => setAtivo(indiceApontado(e, dados.length))}
        onPointerLeave={() => setAtivo(null)}
        onClick={(e) => {
          if (!aoEscolher) return;
          const caixa = e.currentTarget.getBoundingClientRect();
          const i = Math.min(dados.length - 1, Math.max(0, Math.floor(((e.clientX - caixa.left) / (caixa.width || 1)) * dados.length)));
          aoEscolher(i);
        }}
      >
        <Guias marcas={marcas} y={y} />
        <div className="absolute inset-0 flex">
          {dados.map((d, i) => {
            const alto = (Math.abs(d.valor) / (topo - fundo)) * 100;
            const positivo = d.valor >= 0;
            const token = contagem
              ? d.tom === "positivo"
                ? "--positivo"
                : d.tom === "negativo"
                  ? "--negativo"
                  : "--foreground"
              : positivo
                ? "--positivo"
                : "--negativo";
            const forte = mistura(token, ativo === i ? 100 : 88);
            return (
              <div key={i} className="relative min-w-0 flex-1">
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-1/2 w-[64%] max-w-12 -translate-x-1/2 rounded-[2px]"
                  style={{ background: ativo === i ? mistura("--foreground", 7) : "transparent" }}
                />
                <div
                  aria-hidden
                  className="absolute left-1/2 w-[64%] max-w-12 -translate-x-1/2 rounded-[2px]"
                  style={{
                    top: `${positivo ? zero - alto : zero}%`,
                    height: `${alto}%`,
                    background: forte,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div />
      {/* 24/09/2026 (Artur, print do histograma): o rótulo da barra apontada transborda a coluna dela e, quando
          um rótulo fixo cai a menos de `aCada` colunas, os dois se escrevem um por cima do outro ("-R$ 127,38"
          debaixo de "R$ 60,13"). Com o ponteiro em cima, os fixos a essa distância do apontado somem. */}
      {/* 25/11/2026: o rótulo é centrado na coluna por posição absoluta. Como texto centralizado, o que era
          mais largo que a coluna transbordava só para a direita, e o da última barra passava da página no
          celular (392 px numa tela de 375). O da última coluna encosta na borda direita do gráfico. */}
      <div aria-hidden className="mt-1.5 flex h-4 text-[11px] text-muted-foreground tabular-nums">
        {dados.map((d, i) => {
          const fixo = i % aCada === 0 && (ativo === null || Math.abs(i - ativo) >= aCada);
          const ultimo = i === dados.length - 1;
          return (
            <span key={i} className="relative min-w-0 flex-1">
              {fixo || ativo === i ? (
                <span
                  className={`absolute top-0 leading-4 whitespace-nowrap ${ultimo ? "right-0" : "left-1/2 -translate-x-1/2"} ${ativo === i ? "text-foreground" : ""}`}
                >
                  {d.rotulo}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
