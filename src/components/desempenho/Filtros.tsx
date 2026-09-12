"use client";

import Link from "next/link";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { buttonVariants } from "@/components/ui/button";
import { PERIODOS, type Periodo } from "@/lib/stats/periodos";
import type { Base, Unidade } from "@/lib/stats/tipos";

export interface EstadoFiltros {
  periodo: Periodo;
  de: string;
  ate: string;
  unidade: Unidade;
  base: Base;
  contratos: number;
}

interface Props {
  estado: EstadoFiltros;
  onChange: (patch: Partial<EstadoFiltros>) => void;
  hoje: string;
  linkOperacoes: string;
}

const OPCOES_UNIDADE = [
  { valor: "brl", rotulo: "R$" },
  { valor: "pontos", rotulo: "Pontos" },
] as const;
const OPCOES_BASE = [
  { valor: "liquido", rotulo: "Líquido" },
  { valor: "bruto", rotulo: "Bruto" },
] as const;
const CONTRATOS_RAPIDOS = ["1", "2", "3", "5", "10"] as const;

/** Barra de filtros da aba Desempenho: período, unidade, bruto/líquido, contratos. */
export function Filtros({ estado, onChange, hoje, linkOperacoes }: Props) {
  const contratosRapido = CONTRATOS_RAPIDOS.includes(String(estado.contratos) as (typeof CONTRATOS_RAPIDOS)[number])
    ? String(estado.contratos)
    : "outro";

  return (
    <div className="space-y-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Período</p>
          <div className="flex flex-wrap items-center gap-2">
            <Segmentado
              ariaLabel="Período"
              opcoes={PERIODOS}
              valor={estado.periodo}
              onChange={(periodo) => onChange({ periodo })}
            />
            {estado.periodo === "personalizado" ? (
              <div className="flex items-center gap-1.5 text-xs">
                <input
                  type="date"
                  aria-label="Data inicial"
                  value={estado.de}
                  max={estado.ate || hoje}
                  onChange={(e) => onChange({ de: e.target.value })}
                  className="h-8 rounded-lg border bg-background px-2 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
                <span className="text-muted-foreground">até</span>
                <input
                  type="date"
                  aria-label="Data final"
                  value={estado.ate}
                  min={estado.de || undefined}
                  max={hoje}
                  onChange={(e) => onChange({ ate: e.target.value })}
                  className="h-8 rounded-lg border bg-background px-2 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </div>
            ) : null}
          </div>
        </div>

        <Link href={linkOperacoes} className={`${buttonVariants({ size: "sm", variant: "outline" })} ml-auto`}>
          Ver operações e exportar CSV
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Unidade</p>
          <Segmentado
            ariaLabel="Unidade"
            opcoes={OPCOES_UNIDADE}
            valor={estado.unidade}
            onChange={(unidade) => onChange({ unidade })}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Custos</p>
          <Segmentado
            ariaLabel="Bruto ou líquido"
            opcoes={OPCOES_BASE}
            valor={estado.base}
            onChange={(base) => onChange({ base })}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Contratos <span className="normal-case">(com N contratos seria…)</span>
          </p>
          <div className="flex items-center gap-2">
            <Segmentado
              ariaLabel="Contratos"
              opcoes={[...CONTRATOS_RAPIDOS.map((c) => ({ valor: c, rotulo: c })), { valor: "outro", rotulo: "Outro" }]}
              valor={contratosRapido}
              onChange={(v) => {
                if (v !== "outro") onChange({ contratos: Number(v) });
              }}
            />
            {contratosRapido === "outro" ? (
              <input
                type="number"
                min={1}
                max={1000}
                step={1}
                aria-label="Quantidade de contratos"
                value={estado.contratos}
                onChange={(e) => {
                  const n = Math.max(1, Math.min(1000, Math.floor(Number(e.target.value) || 1)));
                  onChange({ contratos: n });
                }}
                className="h-8 w-20 rounded-lg border bg-background px-2 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            ) : (
              <button
                type="button"
                onClick={() => onChange({ contratos: 4 })}
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                outro valor
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
