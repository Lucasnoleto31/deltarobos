"use client";

import { ArrowLeft, Share2 } from "lucide-react";
import Link from "next/link";
import { AtualizadoHa } from "@/components/compartilhados/AtualizadoHa";
import { BadgeStatusRobo } from "@/components/compartilhados/BadgeStatusRobo";
import { Valor } from "@/components/compartilhados/Valor";
import { useRobo } from "@/components/robo/RoboAoVivoProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgora } from "@/hooks/useAgora";
import { formatarDataLonga, formatarHora, formatarPreco, rotuloLado } from "@/lib/formato";
import { pregaoAberto } from "@/lib/stats/pregao";
import { statusAoVivo } from "@/lib/stats/status-robo";

/** Tela cheia do dia: número grande, posição aberta, últimas operações. Pensada pra print vertical. */
export function TelaAoVivo() {
  const { estado, robo, pregao, feriados, hoje } = useRobo();
  const agora = useAgora(1000);

  const ops = estado.operacoes;
  const liquido = ops.reduce((s, o) => s + o.resultado_brl_por_contrato - o.custos_brl_por_contrato, 0);
  const pontos = ops.reduce((s, o) => s + o.pontos_por_contrato, 0);
  const gains = ops.filter((o) => o.resultado_brl_por_contrato - o.custos_brl_por_contrato > 0).length;

  const aberto = agora ? pregaoAberto(agora, pregao, feriados) : false;
  const status = statusAoVivo({
    status: robo.status,
    posicionado: estado.posicoes.length > 0,
    ultimoHeartbeatEm: estado.ultimoHeartbeatEm,
    horarioInicio: robo.horario_inicio,
    horarioFim: robo.horario_fim,
    pregaoAberto: aberto,
    agora: agora ?? new Date(0),
    temColetor: robo.tem_coletor,
  });

  const compartilhar = async () => {
    const url = window.location.href;
    const texto = `${robo.nome} hoje: ${liquido >= 0 ? "+" : ""}${liquido.toFixed(2).replace(".", ",")} R$/contrato`;
    try {
      if (navigator.share) await navigator.share({ title: `${robo.nome} ao vivo`, text: texto, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* usuário cancelou */
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-5">
      <header className="flex items-center justify-between gap-2">
        <Link href={`/robos/${robo.slug}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {robo.nome}
        </Link>
        <BadgeStatusRobo status={status} />
      </header>

      <section className="flex flex-1 flex-col justify-center py-10 text-center">
        <p className="text-sm text-muted-foreground first-letter:uppercase">{formatarDataLonga(hoje)}</p>
        <p className="mt-3 text-6xl font-semibold tracking-tight sm:text-7xl">
          <Valor valor={liquido} />
        </p>
        <p className="mt-2 text-lg text-muted-foreground tabular-nums">
          <Valor valor={pontos} unidade="pontos" colorir={false} className="text-foreground" /> · {ops.length}{" "}
          {ops.length === 1 ? "operação" : "operações"}
          {ops.length > 0 ? ` · ${gains} gain` : ""}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">por contrato, líquido de custos</p>
        <div className="mt-4 flex justify-center">
          <AtualizadoHa em={estado.ultimaMensagemEm ?? estado.ultimoHeartbeatEm} />
        </div>
      </section>

      {estado.posicoes.length > 0 ? (
        <section className="mb-4 space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Posição aberta</p>
          {estado.posicoes.map((p) => (
            <div
              key={`${p.simbolo}-${p.lado}`}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                p.lado === "compra" ? "border-positivo/40 bg-positivo/5" : "border-negativo/40 bg-negativo/5"
              }`}
            >
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={p.lado === "compra" ? "bg-positivo/15 text-positivo" : "bg-negativo/15 text-negativo"}>
                  {rotuloLado(p.lado)}
                </Badge>
                <span className="text-sm font-medium">{p.simbolo}</span>
                <span className="text-sm text-muted-foreground tabular-nums">@ {formatarPreco(p.preco_abertura)}</span>
              </div>
              <Valor valor={p.lucro_flutuante_por_contrato} className="font-semibold" />
            </div>
          ))}
        </section>
      ) : null}

      <section className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Últimas operações</p>
        {ops.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
            Nenhuma operação fechada hoje ainda.
          </p>
        ) : (
          <ul className="divide-y painel">
            {[...ops]
              .reverse()
              .slice(0, 10)
              .map((o) => (
                <li key={o.id} className="flex items-center justify-between px-4 py-2.5 text-sm tabular-nums">
                  <span className="text-muted-foreground">{formatarHora(o.fechamento_em)}</span>
                  <span className={o.lado === "compra" ? "text-positivo" : "text-negativo"}>{rotuloLado(o.lado)}</span>
                  <Valor valor={o.pontos_por_contrato} unidade="pontos" colorir={false} className="text-muted-foreground" />
                  <Valor valor={o.resultado_brl_por_contrato - o.custos_brl_por_contrato} className="font-medium" />
                </li>
              ))}
          </ul>
        )}
      </section>

      <footer className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
        <span>Delta Robôs · dados direto do MT5</span>
        <Button variant="ghost" size="sm" onClick={compartilhar}>
          <Share2 data-icon="inline-start" /> Compartilhar
        </Button>
      </footer>
    </main>
  );
}
