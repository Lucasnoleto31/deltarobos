"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dica,
  Eixo,
  Guias,
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
}

// a fileira de rótulos embaixo das barras entra na conta da altura pedida
const ALTURA_DOS_ROTULOS = 22;

/**
 * Barras verticais pelo sinal (mensal, dia da semana, hora, histograma), no desenho do Zeve Hub
 * desde 17/09/2026: barra em HTML com gradiente e trilho atrás, guias pontilhadas, espessura igual
 * em todo gráfico (64% da coluna, no máximo 32 px) e dica em cartão ao apontar ou tocar. A interface
 * é a mesma de antes (era Recharts): quem chama não mudou.
 */
export function GraficoBarras({ dados, unidade, altura = 220, contagem = false, rotuloN = "Operações" }: Props) {
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

  // a média é pequena: sempre com centavos (ou uma casa, em pontos)
  const naMedia = (v: number) => (unidade === "brl" ? formatarBRL(v, { sinal: true }) : `${formatarPontos(v, true)} pts`);

  const dicaDe = (d: DadoBarra): ConteudoDaDica =>
    contagem
      ? { titulo: d.rotulo, linhas: [{ rotulo: "Operações", valor: formatarNumero(Math.round(d.valor)) }] }
      : {
          titulo: d.rotulo,
          linhas: [
            { rotulo: "Resultado", valor: naDica(d.valor), tom: tomDe(d.valor) },
            ...(d.n !== undefined ? [{ rotulo: rotuloN, valor: formatarNumero(d.n) }] : []),
            ...(d.n !== undefined && d.n > 0
              ? [
                  {
                    rotulo: rotuloN === "Operações" ? "Média por operação" : "Média por dia",
                    valor: naMedia(d.valor / d.n),
                    tom: tomDe(d.valor),
                  },
                ]
              : []),
          ],
        };

  const rotuloDoGrafico = contagem ? "Operações por faixa de resultado" : "Resultado por período";

  return (
    <div role="img" aria-label={rotuloDoGrafico} className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-2">
      <Eixo marcas={marcas} y={y} altura={area} formatar={noEixo} />
      <div
        ref={areaRef}
        className="relative touch-pan-y"
        style={{ height: area }}
        onPointerMove={(e) => setAtivo(indiceApontado(e, dados.length))}
        onPointerDown={(e) => setAtivo(indiceApontado(e, dados.length))}
        onPointerLeave={() => setAtivo(null)}
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
                  className="absolute inset-y-0 left-1/2 w-[64%] max-w-8 -translate-x-1/2 rounded-[3px]"
                  style={{ background: mistura("--foreground", ativo === i ? 9 : 3.5) }}
                />
                <div
                  aria-hidden
                  className="absolute left-1/2 w-[64%] max-w-8 -translate-x-1/2 rounded-[3px]"
                  style={{
                    top: `${positivo ? zero - alto : zero}%`,
                    height: `${alto}%`,
                    // forte na ponta do valor, esmaecida junto do zero
                    background: `linear-gradient(${positivo ? "to bottom" : "to top"}, ${forte}, ${mistura(token, 28)})`,
                  }}
                />
              </div>
            );
          })}
        </div>
        {ativo !== null && dados[ativo] ? (
          <Dica conteudo={dicaDe(dados[ativo])} emPct={((ativo + 0.5) / dados.length) * 100} />
        ) : null}
      </div>
      <div />
      <div aria-hidden className="mt-1.5 flex text-[11px] text-muted-foreground tabular-nums">
        {dados.map((d, i) => (
          <span
            key={i}
            className={`min-w-0 flex-1 overflow-visible text-center whitespace-nowrap ${ativo === i ? "text-foreground" : ""}`}
          >
            {i % aCada === 0 || ativo === i ? d.rotulo : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
