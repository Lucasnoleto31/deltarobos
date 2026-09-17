"use client";

import Link from "next/link";
import { AtualizadoHa } from "@/components/compartilhados/AtualizadoHa";
import { Valor } from "@/components/compartilhados/Valor";
import { useAgora } from "@/hooks/useAgora";
import { formatarDataLonga, formatarPct } from "@/lib/formato";
import { pregaoAberto } from "@/lib/stats/pregao";
import { useCasa } from "./CasaAoVivoProvider";

/** Item 4 da home: resumo do dia; após o fechamento vira "Fechamento de hoje", pensado pra print. */
export function ResumoDoDia() {
  const { estado, feriados, pregaoGeral, hoje } = useCasa();
  const agora = useAgora(30_000);
  const resumo = estado.resumo;
  if (!resumo) return null;

  const robos = [...resumo.robos]
    .filter((r) => r.status === "ativo" || r.n_operacoes > 0)
    .sort((a, b) => b.resultado_liquido_por_contrato - a.resultado_liquido_por_contrato);
  if (robos.length === 0) return null;

  const aberto = agora ? pregaoAberto(agora, pregaoGeral, feriados) : true;
  const fechamento = !aberto && resumo.n_operacoes > 0;
  const melhor = robos[0];
  const acerto = resumo.n_operacoes > 0 ? resumo.n_gain / resumo.n_operacoes : null;

  return (
    <section id="resumo-do-dia" className="conteudo scroll-mt-20 py-8">
      <div className="painel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {fechamento ? "Fechamento de hoje" : "Resumo do dia"}
            </h2>
            <p className="text-sm text-muted-foreground first-letter:uppercase">{formatarDataLonga(resumo.dia ?? hoje)}</p>
          </div>
          <AtualizadoHa em={estado.ultimaMensagemEm ?? resumo.gerado_em} />
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Casa, por contrato</dt>
            <dd className="text-2xl font-semibold">
              <Valor valor={resumo.resultado_liquido_por_contrato} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Operações</dt>
            <dd className="text-2xl font-semibold tabular-nums">{resumo.n_operacoes}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Acerto do dia</dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatarPct(acerto, 0)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Melhor robô</dt>
            <dd className="text-2xl font-semibold">
              {melhor.n_operacoes > 0 ? (
                <Link href={`/robos/${melhor.slug}`} className="hover:underline">
                  {melhor.nome}
                </Link>
              ) : (
                "–"
              )}
            </dd>
          </div>
        </dl>

        <ul className="mt-5 divide-y rounded-xl border">
          {robos.map((r) => (
            <li key={r.slug} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <Link href={`/robos/${r.slug}`} className="font-medium hover:underline">
                {r.nome}
                {r.posicionado ? <span className="ml-2 text-xs text-info">posicionado</span> : null}
              </Link>
              <span className="text-muted-foreground tabular-nums">
                {r.n_operacoes} op.{r.n_operacoes > 0 ? ` · ${Math.round((r.n_gain / r.n_operacoes) * 100)}%` : ""}
              </span>
              <Valor valor={r.resultado_liquido_por_contrato} className="font-semibold" />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Líquido de custos, por 1 contrato. Direto do MT5.</p>
      </div>
    </section>
  );
}
