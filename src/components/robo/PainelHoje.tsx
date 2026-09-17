"use client";

import { cn } from "cn";
import { AtualizadoHa } from "@/components/compartilhados/AtualizadoHa";
import { Valor } from "@/components/compartilhados/Valor";
import { Badge } from "@/components/ui/badge";
import { useAgora } from "@/hooks/useAgora";
import { formatarDataLonga, formatarDuracao, formatarHora, formatarPreco, haQuanto, rotuloLado } from "@/lib/formato";
import { brlParaPontos } from "@/lib/stats/normalizacao";
import { useRobo } from "./RoboAoVivoProvider";

/** "Hoje ao vivo" (spec §8.2): resultado do dia, posição aberta e operações entrando na hora. */
export function PainelHoje() {
  const { estado, robo, hoje } = useRobo();
  const agora = useAgora(1000);

  const ops = estado.operacoes;
  const pontos = ops.reduce((s, o) => s + o.pontos_por_contrato, 0);
  const bruto = ops.reduce((s, o) => s + o.resultado_brl_por_contrato, 0);
  const custos = ops.reduce((s, o) => s + o.custos_brl_por_contrato, 0);
  const liquido = bruto - custos;
  const gains = ops.filter((o) => o.resultado_brl_por_contrato - o.custos_brl_por_contrato > 0).length;

  const atualizadoEm = estado.ultimaMensagemEm ?? estado.ultimoHeartbeatEm;

  return (
    <section aria-labelledby="hoje" className="painel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <h2 id="hoje" className="font-semibold">
          Hoje ao vivo{" "}
          <span className="font-normal text-muted-foreground">· {formatarDataLonga(hoje)}</span>
        </h2>
        <AtualizadoHa em={atualizadoEm} />
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1.4fr]">
        {/* resultado do dia + posição */}
        <div className="space-y-5">
          <div>
            <p className="text-sm text-muted-foreground">Resultado do dia, por contrato</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
              <Valor valor={liquido} />
            </p>
            <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
              <Valor valor={pontos} unidade="pontos" colorir={false} className="text-foreground" />
              <span>·</span>
              <span className="tabular-nums">
                {ops.length} {ops.length === 1 ? "operação" : "operações"}
              </span>
              {ops.length > 0 ? (
                <>
                  <span>·</span>
                  <span className="tabular-nums">
                    {gains}/{ops.length} gain
                  </span>
                </>
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
                        "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5",
                        p.lado === "compra" ? "border-positivo/40 bg-positivo/5" : "border-negativo/40 bg-negativo/5",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={p.lado === "compra" ? "bg-positivo/15 text-positivo" : "bg-negativo/15 text-negativo"}
                        >
                          {rotuloLado(p.lado)}
                        </Badge>
                        <span className="text-sm font-medium">{p.simbolo}</span>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          @ {formatarPreco(p.preco_abertura)}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          <Valor valor={p.lucro_flutuante_por_contrato} />
                          <span className="ml-1 text-xs font-normal text-muted-foreground">/ct</span>
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          <Valor valor={flutuantePontos} unidade="pontos" colorir={false} className="text-muted-foreground" />
                          {agora ? ` · aberta ${haQuanto(p.aberta_em, agora)}` : null}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* operações do dia */}
        <div>
          <p className="mb-2 text-sm font-medium">Operações de hoje</p>
          {ops.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              Nenhuma operação fechada hoje ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="[&>th]:pb-2 [&>th]:font-medium">
                    <th>Fech.</th>
                    <th>Lado</th>
                    <th className="text-right">Entrada</th>
                    <th className="text-right">Saída</th>
                    <th className="text-right">Pontos</th>
                    <th className="text-right">R$ /ct</th>
                  </tr>
                </thead>
                <tbody className="[&>tr]:border-t">
                  {[...ops].reverse().map((o) => {
                    const liq = o.resultado_brl_por_contrato - o.custos_brl_por_contrato;
                    return (
                      <tr key={o.id} className="[&>td]:py-2 tabular-nums">
                        <td>
                          <span className="font-medium">{formatarHora(o.fechamento_em)}</span>
                          <span className="ml-1 text-xs text-muted-foreground">
                            {formatarDuracao(o.duracao_seg)}
                          </span>
                        </td>
                        <td>
                          <span className={o.lado === "compra" ? "text-positivo" : "text-negativo"}>
                            {rotuloLado(o.lado)}
                          </span>
                        </td>
                        <td className="text-right">{formatarPreco(o.preco_entrada)}</td>
                        <td className="text-right">{formatarPreco(o.preco_saida)}</td>
                        <td className="text-right">
                          <Valor valor={o.pontos_por_contrato} unidade="pontos" />
                        </td>
                        <td className="text-right font-medium">
                          <Valor valor={liq} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
