"use client";

import { cn } from "cn";
import Link from "next/link";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarDataLonga, formatarNumero, formatarPct } from "@/lib/formato";
import { CabecaSecao } from "./CabecaSecao";
import { useCasa, usePregaoAberto } from "./CasaAoVivoProvider";
import { PontoRobo } from "./cores";

interface Props {
  /** robos_publico.ordem por slug, para a cor de cada robô (o resumo ao vivo não traz a ordem) */
  ordens: Record<string, number>;
}

/**
 * Item 4 da home: o dia robô a robô. Durante o pregão, os quatro números do topo repetiam o cartão do
 * hero logo acima (18/09/2026, Artur: "cuidado com a redundância"): ficou só a comparação, uma barra por
 * robô, e uma frase com o fato do dia. Depois do fechamento vira "Fechamento de hoje", pensado para
 * print, e aí volta a trazer os números do dia, porque o print não leva o hero junto. Sem operação
 * fechada hoje, em qualquer horário, a seção não aparece (19/09/2026): eram barras zeradas debaixo do
 * hero. Ela volta sozinha, ao vivo, com a primeira operação do dia.
 *
 * 13/10/2026, mídia kit da Zeve: cada robô leva o ponto na cor dele (pela `ordem` do banco, que a página manda
 * por slug) e a barra e o número seguem o sinal, verde ou vermelho. No fechamento, o total é o número
 * protagonista (Valor em destaque). Robô que ainda não operou fica com a barra vazia e o zero em cinza.
 */
export function ResumoDoDia({ ordens }: Props) {
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

  // a frase de baixo do título é o fato do dia, não a descrição da seção; o valor sai pintado pelo sinal
  const fato =
    comOperacao.length > 1 && total > 0 && melhor.resultado_liquido_por_contrato > 0 ? (
      `${melhor.nome} respondeu por ${formatarPct(Math.min(1, melhor.resultado_liquido_por_contrato / total), 0)} do resultado do dia.`
    ) : total < 0 && pior.resultado_liquido_por_contrato < 0 ? (
      <>
        {pior.nome} tem o pior resultado do dia:{" "}
        <Valor valor={pior.resultado_liquido_por_contrato} className="font-semibold" />.
      </>
    ) : (
      <>
        {melhor.nome}: <Valor valor={melhor.resultado_liquido_por_contrato} className="font-semibold" /> hoje.
      </>
    );

  return (
    // o scroll-mt-20 saiu em 19/09/2026: quem desconta o cabeçalho é o scroll-padding-top do html
    <section id="resumo-do-dia" className="conteudo py-8">
      {/* só o título entra ao rolar. O painel abaixo é número ao vivo: ele muda sozinho durante o
          pregão, e uma entrada ali competiria com a própria atualização (19/09/2026) */}
      <CabecaSecao
        titulo={fechamento ? "Fechamento de hoje" : "Hoje, robô a robô"}
        apoio={fechamento ? formatarDataLonga(resumo.dia ?? hoje) : fato}
      />

      <div className="painel vidro p-5 sm:p-6">
        {fechamento ? (
          // o fio embaixo separa os números do dia da comparação robô a robô
          <dl className="mb-5 grid grid-cols-2 gap-4 border-b border-(--painel-fio) pb-5 sm:grid-cols-4">
            <div>
              <dt className="rotulo-metrica">Todos os robôs, por contrato</dt>
              <dd className="mt-1.5">
                <Valor valor={total} destaque className="text-2xl" />
              </dd>
            </div>
            <div>
              <dt className="rotulo-metrica">Operações</dt>
              <dd className="mt-1.5 text-2xl leading-none font-semibold tabular-nums">{formatarNumero(resumo.n_operacoes)}</dd>
            </div>
            <div>
              <dt className="rotulo-metrica">Acerto do dia</dt>
              <dd className="mt-1.5 text-2xl leading-none font-semibold tabular-nums">{formatarPct(acerto, 0)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="rotulo-metrica">Melhor robô</dt>
              <dd className="mt-1.5 flex items-center gap-2 text-2xl leading-none font-semibold">
                {ordens[melhor.slug] !== undefined ? <PontoRobo ordem={ordens[melhor.slug]} className="size-2.5" /> : null}
                <span className="truncate">{melhor.nome}</span>
              </dd>
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
                    <span className="min-w-0 font-medium">
                      {ordens[r.slug] !== undefined ? (
                        <PontoRobo ordem={ordens[r.slug]} className="mr-2 align-middle" />
                      ) : null}
                      <span className="group-hover:underline">{r.nome}</span>
                      {/* sem o contador de operações em aberto aqui (21/09/2026): a 375 px "posicionado · 3 op."
                          quebrava a linha do robô e "op." ficava com dois sentidos a 100 px de "12 op."; o card
                          logo acima já mostra o número, e esta seção é a comparação */}
                      {r.posicionado ? <span className="ml-2 text-xs font-normal text-info">posicionado</span> : null}
                    </span>
                    <span className="flex items-baseline gap-3">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatarNumero(r.n_operacoes)} op.{r.n_operacoes > 0 ? ` · ${formatarPct(r.n_gain / r.n_operacoes, 0)}` : ""}
                      </span>
                      <Valor valor={v} className="font-semibold" />
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-1.5 rounded-full transition-[width] duration-700 motion-reduce:transition-none",
                        v >= 0 ? "bg-positivo" : "bg-negativo",
                      )}
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
