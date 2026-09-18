"use client";

import { cn } from "cn";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import { PERIODOS_RESUMO, noPeriodo, type PeriodoFechado } from "@/components/robo/periodos-resumo";
import { formatarNumero } from "@/lib/formato";
import { valorDia } from "@/lib/stats/serie";
import type { LinhaDiaria } from "@/lib/stats/tipos";

export interface RoboParaBarras {
  slug: string;
  nome: string;
  ativo: string;
  valorPonto: number;
  linhas: LinhaDiaria[];
}

interface Props {
  robos: RoboParaBarras[];
  hoje: string;
}

const OPCOES = PERIODOS_RESUMO.filter((p) => p.valor !== "hoje") as ReadonlyArray<{ valor: PeriodoFechado; rotulo: string }>;

/**
 * Os robôs lado a lado num período só (18/09/2026, "deixe o comparativo mais intuitivo e útil"): uma
 * barra por robô, do maior para o menor, com o resultado, as operações e os pregões do recorte. Sem
 * curva: aqui a pergunta é "qual rendeu mais neste mês", e a barra responde de relance.
 */
export function BarrasPorRobo({ robos, hoje }: Props) {
  const [periodo, setPeriodo] = useState<PeriodoFechado>("mes");

  const linhas = useMemo(() => {
    return robos
      .map((r) => {
        const recorte = noPeriodo(r.linhas, periodo, hoje);
        const opcoes = { base: "liquido" as const, unidade: "brl" as const, valorPonto: r.valorPonto };
        const total = recorte.reduce((s, l) => s + valorDia(l, opcoes), 0);
        const nOps = recorte.reduce((s, l) => s + l.n_operacoes, 0);
        return { ...r, total, nOps, nDias: recorte.length };
      })
      .sort((a, b) => b.total - a.total);
  }, [robos, periodo, hoje]);

  const maior = Math.max(1, ...linhas.map((l) => Math.abs(l.total)));

  return (
    <section className="painel">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3 sm:px-5">
        <div>
          <h2 className="font-semibold">Quem rendeu mais</h2>
          <p className="text-xs text-muted-foreground">por 1 contrato, líquido de custos</p>
        </div>
        <Segmentado ariaLabel="Período" opcoes={OPCOES} valor={periodo} onChange={setPeriodo} />
      </div>
      <ol className="p-4 sm:p-5">
        {linhas.map((r, i) => (
          <li key={r.slug} className="sep [--sep:0px] grid grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)_auto] items-center gap-4 py-3 text-sm">
            <div className="min-w-0">
              <Link href={`/robos/${r.slug}`} className="block truncate font-medium hover:underline">
                <span className="mr-2 text-xs text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                {r.nome}
              </Link>
              <span className="ml-6 text-xs text-muted-foreground">{r.ativo}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className={cn("h-2 rounded-full transition-[width] duration-500", r.total >= 0 ? "bg-positivo" : "bg-negativo")}
                style={{ width: `${r.nDias === 0 ? 0 : Math.max(2, Math.round((Math.abs(r.total) / maior) * 100))}%` }}
              />
            </div>
            <div className="w-32 text-right">
              {r.nDias === 0 ? (
                <span className="text-muted-foreground">sem operações</span>
              ) : (
                <>
                  <Valor valor={r.total} inteiro={Math.abs(r.total) >= 1000} className="font-semibold" />
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {formatarNumero(r.nOps)} op · {formatarNumero(r.nDias)} {r.nDias === 1 ? "pregão" : "pregões"}
                  </p>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
