"use client";

import { cn } from "cn";
import Link from "next/link";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarBRL, formatarDataLonga, formatarNumero, formatarPct } from "@/lib/formato";
import { useCasa, usePregaoAberto } from "./CasaAoVivoProvider";

/**
 * Item 4 da home: o dia robô a robô. Durante o pregão, os quatro números do topo repetiam o cartão do
 * hero logo acima (18/09/2026, Artur: "cuidado com a redundância"): ficou só a comparação, uma barra por
 * robô, e uma frase com o fato do dia. Depois do fechamento vira "Fechamento de hoje", pensado para
 * print, e aí volta a trazer os números do dia, porque o print não leva o hero junto. Sem operação
 * fechada hoje, em qualquer horário, a seção não aparece (19/09/2026): eram barras zeradas debaixo do
 * hero. Ela volta sozinha, ao vivo, com a primeira operação do dia.
 */
export function ResumoDoDia() {
  const { estado, hoje } = useCasa();
  // até a hidratação vale o valor do servidor (19/09/2026): antes era "aberto", e depois das 18h o HTML
  // chegava com "Hoje, robô a robô" e trocava para "Fechamento de hoje" empurrando a página
  const aberto = usePregaoAberto();
  const resumo = estado.resumo;
  if (!resumo) return null;

  const robos = [...resumo.robos]
    .filter((r) => r.status === "ativo" || r.n_operacoes > 0)
    .sort((a, b) => b.resultado_liquido_por_contrato - a.resultado_liquido_por_contrato);
  const comOperacao = robos.filter((r) => r.n_operacoes > 0);
  if (comOperacao.length === 0) return null;

  const fechamento = !aberto && resumo.n_operacoes > 0;
  const total = resumo.resultado_liquido_por_contrato;
  const melhor = comOperacao[0];
  const pior = comOperacao[comOperacao.length - 1];
  const maior = Math.max(1, ...robos.map((r) => Math.abs(r.resultado_liquido_por_contrato)));
  const acerto = resumo.n_operacoes > 0 ? resumo.n_gain / resumo.n_operacoes : null;

  // a frase de baixo do título é o fato do dia, não a descrição da seção
  const fato =
    comOperacao.length > 1 && total > 0 && melhor.resultado_liquido_por_contrato > 0
      ? `${melhor.nome} respondeu por ${formatarPct(Math.min(1, melhor.resultado_liquido_por_contrato / total), 0)} do resultado do dia.`
      : total < 0 && pior.resultado_liquido_por_contrato < 0
        ? `${pior.nome} tem o pior resultado do dia: ${formatarBRL(pior.resultado_liquido_por_contrato, { sinal: true })}.`
        : `${melhor.nome}: ${formatarBRL(melhor.resultado_liquido_por_contrato, { sinal: true })} hoje.`;

  return (
    <section id="resumo-do-dia" className="conteudo scroll-mt-20 py-8">
      <div className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{fechamento ? "Fechamento de hoje" : "Hoje, robô a robô"}</h2>
        <p className="text-sm text-muted-foreground">{fechamento ? formatarDataLonga(resumo.dia ?? hoje) : fato}</p>
      </div>

      <div className="painel vidro p-5 sm:p-6">
        {fechamento ? (
          <dl className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Todos os robôs, por contrato</dt>
              <dd className="text-2xl font-semibold">
                <Valor valor={total} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Operações</dt>
              <dd className="text-2xl font-semibold tabular-nums">{formatarNumero(resumo.n_operacoes)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Acerto do dia</dt>
              <dd className="text-2xl font-semibold tabular-nums">{formatarPct(acerto, 0)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Melhor robô</dt>
              <dd className="text-2xl font-semibold">{melhor.nome}</dd>
            </div>
          </dl>
        ) : null}

        <ol className="space-y-4">
          {robos.map((r) => {
            const v = r.resultado_liquido_por_contrato;
            return (
              <li key={r.slug}>
                <Link href={`/robos/${r.slug}`} className="group block outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium group-hover:underline">
                      {r.nome}
                      {r.posicionado ? <span className="ml-2 text-xs font-normal text-info">posicionado</span> : null}
                    </span>
                    <span className="flex items-baseline gap-3">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatarNumero(r.n_operacoes)} op.{r.n_operacoes > 0 ? ` · ${formatarPct(r.n_gain / r.n_operacoes, 0)}` : ""}
                      </span>
                      <Valor valor={v} className="font-semibold" />
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                    <div
                      className={cn("h-1.5 rounded-full transition-[width] duration-700", v >= 0 ? "bg-positivo" : "bg-negativo")}
                      style={{ width: `${v === 0 ? 0 : Math.max(2, Math.round((Math.abs(v) / maior) * 100))}%` }}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
        {fechamento ? <p className="mt-4 text-xs text-muted-foreground">Líquido de custos, por 1 contrato. Direto do MT5.</p> : null}
      </div>
    </section>
  );
}
