"use client";

import { useMemo, useState } from "react";
import { Dica, Eixo, Guias, indiceApontado, mistura, passo, type ConteudoDaDica } from "@/components/graficos/base";
import { rotulosDeData } from "@/components/graficos/series-da-curva";
import { formatarBRL, formatarData, formatarPct } from "@/lib/formato";
import type { PontoCurva } from "@/lib/stats/tipos";

interface Props {
  curva: readonly PontoCurva[];
  capitalReferencia: number | null;
  altura?: number;
}

// acima disso cada coluna vira uma fatia de dias, como na curva de capital
const MAX_COLUNAS = 240;
const ALTURA_DOS_ROTULOS = 22;

/**
 * Quanto abaixo do pico o robô esteve em cada pregão: uma coluna por dia pendurada no zero, mais
 * funda quanto maior o drawdown. É a mesma faixa vermelha que fica embaixo da curva de capital, em
 * tamanho de gráfico e com a dica (18/09/2026, no lugar dos blocos por episódio, que o Artur achou
 * feios e pouco intuitivos). Zero = no topo. Apontar ou tocar abre o dia.
 */
export function AbaixoDoPico({ curva, capitalReferencia, altura = 240 }: Props) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const temCapital = Boolean(capitalReferencia && capitalReferencia > 0);

  const colunas = useMemo(() => {
    const n = curva.length;
    if (n === 0) return [];
    const tamanho = n / MAX_COLUNAS;
    const fatias =
      n <= MAX_COLUNAS
        ? curva.map((p) => [p])
        : Array.from({ length: MAX_COLUNAS }, (_, k) => {
            const de = Math.floor(k * tamanho);
            return curva.slice(de, Math.max(de + 1, Math.floor((k + 1) * tamanho)));
          });
    // cada coluna mostra o pior dia da fatia; o pico é o da curva (o mesmo para todos os dias da fatia)
    return fatias.map((fatia) => {
      const pior = fatia.reduce((m, p) => (p.drawdown < m.drawdown ? p : m), fatia[0]);
      return { primeiro: fatia[0].dia, ultimo: fatia[fatia.length - 1].dia, pior, dias: fatia.length };
    });
  }, [curva]);

  const maior = Math.max(1, ...colunas.map((c) => -c.pior.drawdown));
  // 19/09/2026: a escala vai até um valor redondo na unidade do eixo (% ou R$), em passos redondos.
  // Ia até o próprio máximo, e as marcas saíam quebradas: 0%, 49%, 99%.
  const escala = temCapital ? (capitalReferencia as number) : 1;
  const degrau = passo(maior / escala);
  const dominio = Math.max(1, Math.ceil(maior / escala / degrau - 1e-9)) * degrau * escala;
  const rotulosX = useMemo(() => rotulosDeData(curva.map((p) => p.dia)), [curva]);

  if (colunas.length === 0) {
    return (
      <div className="grid place-items-center text-sm text-muted-foreground" style={{ height: altura }}>
        Sem pregões no período.
      </div>
    );
  }

  const area = altura - ALTURA_DOS_ROTULOS;
  // casas do % pelo passo: 2,5% precisa de uma, 50% de nenhuma
  const casas = [0, 1, 2, 3].find((d) => Math.abs(Math.round(degrau * 100 * 10 ** d) - degrau * 100 * 10 ** d) < 1e-6) ?? 3;
  const formatar = (v: number) =>
    temCapital ? formatarPct(v / escala, casas) : formatarBRL(v, { inteiro: degrau >= 1 });
  const marcas: number[] = [];
  for (let k = 0; k * degrau * escala <= dominio + (degrau * escala) / 2; k++) marcas.push(-k * degrau * escala);
  const y = (v: number) => (-v / dominio) * 100;

  const dicaDe = (c: (typeof colunas)[number]): ConteudoDaDica => {
    const dd = -c.pior.drawdown;
    return {
      titulo: c.dias === 1 ? formatarData(c.pior.dia) : `${formatarData(c.primeiro)} a ${formatarData(c.ultimo)}`,
      subtitulo: dd === 0 ? "no topo" : `pico de ${formatarBRL(c.pior.pico, { inteiro: c.pior.pico >= 1000 })} ainda não recuperado`,
      linhas: [
        {
          rotulo: c.dias === 1 ? "Abaixo do pico" : "Pior dia da fatia",
          valor:
            dd === 0
              ? "–"
              : temCapital
                ? `${formatarBRL(dd, { inteiro: dd >= 1000 })} · ${formatarPct(dd / (capitalReferencia as number), 1)}`
                : formatarBRL(dd, { inteiro: dd >= 1000 }),
          tom: dd === 0 ? "neutro" : "negativo",
        },
        { rotulo: "Acumulado", valor: formatarBRL(c.pior.acumulado, { sinal: true, inteiro: Math.abs(c.pior.acumulado) >= 1000 }) },
      ],
    };
  };

  return (
    <div role="img" aria-label="Distância do pico, dia a dia" className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-2">
      {/* `|| 0` porque -0 saía como "−0%" no topo do eixo (19/09/2026) */}
      <Eixo marcas={marcas} y={y} altura={area} formatar={(v) => formatar(-v || 0)} />
      <div
        className="relative touch-pan-y"
        style={{ height: area }}
        onPointerMove={(e) => setAtivo(indiceApontado(e, colunas.length))}
        onPointerDown={(e) => setAtivo(indiceApontado(e, colunas.length))}
        onPointerLeave={() => setAtivo(null)}
      >
        <Guias marcas={marcas} y={y} />
        <div className="absolute inset-0 flex">
          {colunas.map((c, i) => {
            const alto = (-c.pior.drawdown / dominio) * 100;
            const forte = ativo === i;
            return (
              <div key={i} className="relative min-w-0 flex-1">
                <div
                  aria-hidden
                  className="absolute top-0 left-1/2 w-[70%] -translate-x-1/2 rounded-b-[2px]"
                  style={{
                    height: `${alto}%`,
                    minHeight: alto > 0 ? 1 : 0,
                    background: `linear-gradient(to bottom, ${mistura("--negativo", forte ? 45 : 28)}, ${mistura("--negativo", forte ? 100 : 82)})`,
                  }}
                />
              </div>
            );
          })}
        </div>
        {ativo !== null && colunas[ativo] ? <Dica conteudo={dicaDe(colunas[ativo])} emPct={((ativo + 0.5) / colunas.length) * 100} /> : null}
      </div>
      <div />
      <div aria-hidden className="relative mt-1.5 h-4 text-[11px] text-muted-foreground tabular-nums">
        {/* no celular as datas ficam apertadas: só as de índice par, como na curva de capital (19/09/2026) */}
        {rotulosX.map((m, i) => (
          <span key={m.rotulo + m.x} className={`absolute whitespace-nowrap ${i % 2 === 1 ? "max-sm:hidden" : ""}`} style={{ left: `${m.x}%` }}>
            {m.rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}
