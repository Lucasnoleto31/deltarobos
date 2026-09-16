"use client";

import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Valor } from "@/components/compartilhados/Valor";
import { Button } from "@/components/ui/button";
import { formatarBRL, formatarMesAno, formatarPontos } from "@/lib/formato";
import { gradeMes } from "@/lib/stats/calendario";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";

interface Props {
  linhas: LinhaDiaria[];
  opcoes: OpcoesSerie;
  feriados: string[];
  mesesDisponiveis: string[];
  mesInicial: string;
}

const CABECALHO = ["D", "S", "T", "Q", "Q", "S", "S"];

function curto(v: number, unidade: OpcoesSerie["unidade"]): string {
  if (unidade === "pontos") return formatarPontos(v, true);
  return formatarBRL(v, { inteiro: Math.abs(v) >= 100, sinal: true }).replace("R$", "").trim();
}

/** Calendário do mês: um quadrado por dia, verde ou vermelho, com o resultado. */
export function Calendario({ linhas, opcoes, feriados, mesesDisponiveis, mesInicial }: Props) {
  const [mes, setMes] = useState(mesInicial);
  const grade = useMemo(() => gradeMes(linhas, mes, opcoes, feriados), [linhas, mes, opcoes, feriados]);

  const idx = mesesDisponiveis.indexOf(mes);
  const anterior = idx > 0 ? mesesDisponiveis[idx - 1] : null;
  const proximo = idx >= 0 && idx < mesesDisponiveis.length - 1 ? mesesDisponiveis[idx + 1] : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Mês anterior" disabled={!anterior} onClick={() => anterior && setMes(anterior)}>
          <ChevronLeft />
        </Button>
        <p className="font-medium tabular-nums first-letter:uppercase">{formatarMesAno(`${mes}-01`)}</p>
        <Button variant="ghost" size="icon-sm" aria-label="Próximo mês" disabled={!proximo} onClick={() => proximo && setMes(proximo)}>
          <ChevronRight />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {CABECALHO.map((c, i) => (
          <span key={i}>{c}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grade.semanas.flat().map((d) => {
          const semPregao = !d.pregao;
          const tom =
            d.valor === null
              ? semPregao
                ? "bg-transparent text-muted-foreground/40"
                : "bg-muted/50 text-muted-foreground"
              : d.valor > 0
                ? "bg-positivo/15 text-positivo ring-1 ring-positivo/30"
                : d.valor < 0
                  ? "bg-negativo/15 text-negativo ring-1 ring-negativo/30"
                  : "bg-muted text-foreground";
          return (
            <div
              key={d.dia}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-md text-[11px] tabular-nums",
                tom,
                d.foraDoMes && "opacity-0",
              )}
              title={d.valor !== null ? `${d.dia}: ${d.nOperacoes} op.` : d.dia}
            >
              <span className="font-medium">{d.diaDoMes}</span>
              {d.valor !== null ? <span className="text-[10px] leading-tight">{curto(d.valor, opcoes.unidade)}</span> : null}
            </div>
          );
        })}
      </div>

      <dl className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <div>
          <dt className="inline">Mês: </dt>
          <dd className="inline font-semibold">
            <Valor valor={grade.total} unidade={opcoes.unidade} />
          </dd>
        </div>
        <div className="tabular-nums">
          <span className="text-positivo">{grade.nPositivos}</span> × <span className="text-negativo">{grade.nNegativos}</span> dias ·{" "}
          {grade.nDias} com operação
        </div>
      </dl>
    </div>
  );
}
