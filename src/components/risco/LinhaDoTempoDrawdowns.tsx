"use client";

import { useState } from "react";
import { Dica, Eixo, Guias, type ConteudoDaDica } from "@/components/graficos/base";
import { formatarBRL, formatarData, formatarDataCurta, formatarPct } from "@/lib/formato";
import type { EpisodioDrawdown } from "@/lib/stats/risco";

interface Props {
  episodios: EpisodioDrawdown[];
  /** primeiro e último dia da curva: o eixo do tempo */
  de: string;
  ate: string;
  capitalReferencia: number | null;
  altura?: number;
}

const ms = (dia: string) => new Date(`${dia}T00:00:00Z`).getTime();
const ALTURA_DOS_ROTULOS = 22;

/**
 * Os drawdowns como blocos no tempo, no lugar da curva (18/09/2026, Artur: "usa muito gráfico de
 * linha, veja se consegue alterar alguns em páginas como risco"). Cada episódio é um bloco pendurado
 * no pico: a largura é quanto tempo durou, do dia do pico até o dia em que voltou a ele, e a altura é
 * a profundidade. O que ainda não recuperou vai até hoje com a borda tracejada. Apontar abre a dica.
 */
export function LinhaDoTempoDrawdowns({ episodios, de, ate, capitalReferencia, altura = 240 }: Props) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const t0 = ms(de);
  const t1 = Math.max(ms(ate), t0 + 86_400_000);
  const temCapital = Boolean(capitalReferencia && capitalReferencia > 0);
  const maior = Math.max(1, ...episodios.map((e) => e.valor));

  if (episodios.length === 0) {
    return (
      <div className="grid place-items-center text-sm text-muted-foreground" style={{ height: altura }}>
        Nenhum drawdown no período.
      </div>
    );
  }

  const area = altura - ALTURA_DOS_ROTULOS;
  const emPct = (v: number) => (temCapital ? v / (capitalReferencia as number) : v);
  const formatar = (v: number) => (temCapital ? formatarPct(emPct(v), 0) : formatarBRL(v, { inteiro: true }));
  const marcas = [0, -maior / 2, -maior];
  const y = (v: number) => (-v / maior) * 100;

  // uns seis rótulos de data espaçados por igual; em série longa só mês e ano
  const longa = (t1 - t0) / 86_400_000 > 400;
  const rotulos = Array.from({ length: 6 }, (_, i) => {
    const t = t0 + ((t1 - t0) * i) / 6;
    const dia = new Date(t).toISOString().slice(0, 10);
    return { x: (i / 6) * 100, rotulo: longa ? `${dia.slice(5, 7)}/${dia.slice(2, 4)}` : formatarDataCurta(dia) };
  }).filter((m, i, xs) => i === 0 || m.rotulo !== xs[i - 1].rotulo);

  const dicaDe = (e: EpisodioDrawdown): ConteudoDaDica => ({
    titulo: `${formatarData(e.inicio)} → ${e.recuperacao ? formatarData(e.recuperacao) : "em recuperação"}`,
    subtitulo: `fundo em ${formatarData(e.fundo)}`,
    linhas: [
      {
        rotulo: "Profundidade",
        valor: temCapital ? `${formatarBRL(e.valor, { inteiro: e.valor >= 1000 })} · ${formatarPct(emPct(e.valor), 1)}` : formatarBRL(e.valor, { inteiro: e.valor >= 1000 }),
        tom: "negativo",
      },
      { rotulo: "Até o fundo", valor: `${e.diasAteFundo} ${e.diasAteFundo === 1 ? "dia" : "dias"}` },
      { rotulo: "Recuperação", valor: e.diasAteRecuperar !== null ? `${e.diasAteRecuperar} dias` : "ainda não" },
    ],
  });

  return (
    <div role="img" aria-label="Drawdowns ao longo do tempo" className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-2">
      <Eixo marcas={marcas} y={y} altura={area} formatar={(v) => formatar(-v)} />
      <div className="relative" style={{ height: area }} onPointerLeave={() => setAtivo(null)}>
        <Guias marcas={marcas} y={y} />
        {episodios.map((e, i) => {
          const inicio = Math.max(t0, ms(e.inicio));
          const fim = Math.min(t1, e.recuperacao ? ms(e.recuperacao) : t1);
          const left = ((inicio - t0) / (t1 - t0)) * 100;
          const width = Math.max(0.4, ((fim - inicio) / (t1 - t0)) * 100);
          const height = (e.valor / maior) * 100;
          const forte = ativo === i;
          return (
            <button
              key={`${e.inicio}-${e.fundo}`}
              type="button"
              aria-label={`Drawdown de ${formatar(e.valor)} a partir de ${formatarData(e.inicio)}`}
              onPointerEnter={() => setAtivo(i)}
              onFocus={() => setAtivo(i)}
              onClick={() => setAtivo(i)}
              className="absolute top-0 rounded-b-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                height: `${height}%`,
                background: `linear-gradient(to bottom, color-mix(in srgb, var(--negativo) ${forte ? 30 : 18}%, transparent), color-mix(in srgb, var(--negativo) ${forte ? 95 : 72}%, transparent))`,
                borderRight: e.recuperacao ? undefined : "1px dashed var(--negativo)",
              }}
            />
          );
        })}
        {ativo !== null && episodios[ativo] ? (
          <Dica
            conteudo={dicaDe(episodios[ativo])}
            emPct={((Math.max(t0, ms(episodios[ativo].inicio)) - t0) / (t1 - t0)) * 100}
          />
        ) : null}
      </div>
      <div />
      <div aria-hidden className="relative mt-1.5 h-4 text-[11px] text-muted-foreground tabular-nums">
        {rotulos.map((m) => (
          <span key={m.rotulo + m.x} className="absolute whitespace-nowrap" style={{ left: `${m.x}%` }}>
            {m.rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}
