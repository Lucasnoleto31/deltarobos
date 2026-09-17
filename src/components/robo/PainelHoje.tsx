"use client";

import { cn } from "cn";
import { useState } from "react";
import { AtualizadoHa } from "@/components/compartilhados/AtualizadoHa";
import { Valor } from "@/components/compartilhados/Valor";
import { Badge } from "@/components/ui/badge";
import { useAgora } from "@/hooks/useAgora";
import { formatarDataLonga, formatarPreco, haQuanto, rotuloLado } from "@/lib/formato";
import { brlParaPontos } from "@/lib/stats/normalizacao";
import { CurvaDoDia } from "./CurvaDoDia";
import { LinhaOperacao } from "./LinhaOperacao";
import { useRobo } from "./RoboAoVivoProvider";

// Quantas operações aparecem em lista antes do "mostrar as outras". O dia inteiro está na curva
// logo acima; a lista é só o que acabou de acontecer. Num dia de 284 operações a tabela inteira
// tinha 16.600 px no celular, e os KPIs só apareciam umas vinte telas abaixo (17/09/2026).
const VISIVEIS = 5;

/** "Hoje ao vivo" (spec §8.2): resultado do dia, posição aberta e operações entrando na hora. */
export function PainelHoje() {
  const { estado, robo, hoje } = useRobo();
  const agora = useAgora(1000);
  const [todas, setTodas] = useState(false);

  const ops = estado.operacoes;
  const pontos = ops.reduce((s, o) => s + o.pontos_por_contrato, 0);
  const bruto = ops.reduce((s, o) => s + o.resultado_brl_por_contrato, 0);
  const custos = ops.reduce((s, o) => s + o.custos_brl_por_contrato, 0);
  const liquido = bruto - custos;
  const gains = ops.filter((o) => o.resultado_brl_por_contrato - o.custos_brl_por_contrato > 0).length;

  const atualizadoEm = estado.ultimaMensagemEm ?? estado.ultimoHeartbeatEm;

  // a mais recente em cima; as novas entram no topo mesmo com a lista recolhida
  const recentes = [...ops].reverse();
  const mostradas = todas ? recentes : recentes.slice(0, VISIVEIS);
  const escondidas = recentes.length - mostradas.length;

  return (
    <section aria-labelledby="hoje" className="painel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
        <h2 id="hoje" className="font-semibold">
          Hoje ao vivo{" "}
          <span className="font-normal text-muted-foreground max-sm:hidden">· {formatarDataLonga(hoje)}</span>
        </h2>
        <AtualizadoHa em={atualizadoEm} />
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1fr_1.5fr]">
        {/* resultado do dia + posição */}
        <div className="space-y-5">
          <div>
            <p className="text-sm text-muted-foreground">Resultado do dia, por contrato</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
              <Valor valor={liquido} />
            </p>
            <p className="mt-1.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
              <Valor valor={pontos} unidade="pontos" colorir={false} className="text-foreground" />
              <span className="tabular-nums">
                {ops.length} {ops.length === 1 ? "operação" : "operações"}
              </span>
              {ops.length > 0 ? (
                <span className="tabular-nums">
                  {gains}/{ops.length} gain
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Líquido de custos (bruto <Valor valor={bruto} colorir={false} className="text-muted-foreground" />).
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Posição aberta</p>
            {estado.posicoes.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
                Nenhuma posição aberta agora.
              </p>
            ) : (
              <ul className="space-y-2">
                {estado.posicoes.map((p) => {
                  const flutuantePontos = brlParaPontos(p.lucro_flutuante_por_contrato, robo.valor_ponto_brl);
                  return (
                    <li
                      key={`${p.simbolo}-${p.lado}`}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5",
                        p.lado === "compra" ? "border-positivo/40 bg-positivo/5" : "border-negativo/40 bg-negativo/5",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className={p.lado === "compra" ? "bg-positivo/15 text-positivo" : "bg-negativo/15 text-negativo"}
                          >
                            {rotuloLado(p.lado)}
                          </Badge>
                          <span className="text-sm font-medium">{p.simbolo}</span>
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground tabular-nums">
                          @ {formatarPreco(p.preco_abertura)}
                          {agora ? ` · aberta ${haQuanto(p.aberta_em, agora)}` : null}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold">
                          <Valor valor={p.lucro_flutuante_por_contrato} />
                          <span className="ml-1 text-xs font-normal text-muted-foreground">/ct</span>
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          <Valor valor={flutuantePontos} unidade="pontos" colorir={false} className="text-muted-foreground" />
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* o dia em curva e o que acabou de acontecer */}
        <div className="min-w-0 space-y-4">
          {ops.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              Nenhuma operação fechada hoje ainda.
            </p>
          ) : (
            <>
              <CurvaDoDia operacoes={ops} />

              <div>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">Últimas operações de hoje</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {todas || ops.length <= VISIVEIS ? `${ops.length} no total` : `${mostradas.length} de ${ops.length}`}
                  </p>
                </div>
                <ul className="border-y border-(--painel-fio) max-sm:-mx-4">
                  {mostradas.map((o) => (
                    <LinhaOperacao key={o.id} operacao={o} />
                  ))}
                </ul>
                {ops.length > VISIVEIS ? (
                  <button
                    type="button"
                    onClick={() => setTodas((v) => !v)}
                    aria-expanded={todas}
                    className="mt-3 w-full rounded-lg border border-(--painel-fio) px-3 py-2 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-(--linha-hover) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {todas ? "Mostrar só as últimas" : `Mostrar as outras ${escondidas}`}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
