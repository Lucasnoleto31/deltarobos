"use client";

import { AtualizadoHa } from "@/components/compartilhados/AtualizadoHa";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarDataLonga } from "@/lib/formato";
import { useCasa } from "./CasaAoVivoProvider";

/** Número grande do hero: resultado de hoje da casa, por contrato, líquido. */
export function NumeroHero() {
  const { estado, hoje } = useCasa();
  const resumo = estado.resumo;
  const temRobos = (resumo?.robos.length ?? 0) > 0;

  return (
    <div className="rounded-2xl bg-card p-6 ring-1 ring-foreground/10 sm:p-8">
      <p className="text-sm text-muted-foreground">Resultado de hoje da casa</p>
      <p className="mt-2 text-5xl font-semibold tracking-tight sm:text-6xl">
        {resumo && temRobos ? (
          <Valor valor={resumo.resultado_liquido_por_contrato} inteiro={false} />
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        por contrato, líquido de custos, somando todos os robôs ·{" "}
        <span className="capitalize">{formatarDataLonga(resumo?.dia ?? hoje)}</span>
      </p>

      {resumo && temRobos ? (
        <dl className="mt-6 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Operações</dt>
            <dd className="text-lg font-semibold tabular-nums">{resumo.n_operacoes}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Acertos</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {resumo.n_operacoes > 0
                ? `${Math.round((resumo.n_gain / resumo.n_operacoes) * 100)}%`
                : "–"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Posicionados</dt>
            <dd className="text-lg font-semibold tabular-nums">{resumo.n_robos_posicionados}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          Os robôs aparecem aqui assim que entrarem em operação.
        </p>
      )}

      <div className="mt-4">
        <AtualizadoHa em={estado.ultimaMensagemEm ?? resumo?.gerado_em ?? null} />
      </div>
    </div>
  );
}
