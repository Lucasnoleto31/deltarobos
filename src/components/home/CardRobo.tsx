"use client";

import { cn } from "cn";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { BadgeStatusRobo } from "@/components/compartilhados/BadgeStatusRobo";
import { Valor } from "@/components/compartilhados/Valor";
import { MiniCurva } from "@/components/graficos/MiniCurva";
import { Badge } from "@/components/ui/badge";
import { formatarNumero, formatarPct } from "@/lib/formato";
import type { StatusAoVivo } from "@/lib/stats/status-robo";
import { formatarDiaCurto } from "./datas";
import type { DadosCardRobo, UltimoPregao } from "./tipos";

interface Props {
  card: DadosCardRobo;
  status: StatusAoVivo;
  /** operações e gains de hoje, do resumo ao vivo (quando há) */
  hojeOperacoes?: number;
  hojeGains?: number;
  /** quando vem, o destaque é esse dia já fechado no lugar de hoje (pregão fechado ou robô sem coletor, sem operação hoje) */
  ultimoPregao?: UltimoPregao | null;
  /** ms de atraso da entrada, para a grade aparecer em cascata */
  atraso?: number;
}

/**
 * O cartão do robô na home. Em 18/09/2026 à noite virou vidro ("liquid glass", pedido do Artur): a
 * superfície é translúcida com brilho na borda de cima. A luz verde ou vermelha que ficava atrás do
 * vidro saiu no mesmo dia ("não gostei desse verde atrás do card"): a cor fica só nos números. Um
 * número por vez: o de hoje grande, com operações e acerto do dia embaixo; mês e acumulado em apoio;
 * a curva dos 30 dias na largura toda; no pé, o drawdown máximo e o botão redondo que leva ao robô.
 * Com memo (18/09/2026): a grade recalcula o status a cada 5 s, mas as props são primitivas ou
 * estáveis, então o cartão só renderiza de novo quando algo nele muda. Fora do pregão (ou, no robô sem
 * coletor, sempre) e sem operação hoje, o número grande é o do último pregão, com o dia no rótulo
 * (19/09/2026). O selo vai sem a explicação para leitor de tela: o cartão inteiro é um link e ela
 * alongava o nome dele; fica no title. A entrada dura 500 ms
 * só na animação: o duration-500 esticava também o hover do .painel-interativo, que é de 180 ms.
 */
export const CardRobo = memo(function CardRobo({
  card,
  status,
  hojeOperacoes,
  hojeGains,
  ultimoPregao,
  atraso = 0,
}: Props) {
  const emBreve = card.status === "em_breve";
  const destaque = ultimoPregao
    ? {
        rotulo: formatarDiaCurto(ultimoPregao.dia),
        valor: ultimoPregao.valor,
        operacoes: ultimoPregao.nOperacoes,
        gains: ultimoPregao.nGain,
      }
    : { rotulo: "Hoje", valor: card.hoje, operacoes: hojeOperacoes, gains: hojeGains };

  return (
    <Link
      href={`/robos/${card.slug}`}
      style={{ animationDelay: `${atraso}ms` }}
      className={cn(
        "group relative flex h-full flex-col painel vidro painel-interativo p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:animation-duration-500 motion-safe:[--tw-ease:cubic-bezier(0.16,1,0.3,1)]",
        emBreve && "opacity-80",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold leading-tight">{card.nome}</h3>
          <p className="text-xs text-muted-foreground">
            {card.ativoNome} · {card.ativo}
          </p>
        </div>
        <BadgeStatusRobo status={status} explicar={false} />
      </div>

      {emBreve ? (
        <div className="flex flex-1 flex-col justify-between gap-4 pt-5">
          <p className="text-sm text-muted-foreground">{card.descricao ?? "Sem operações ainda."}</p>
          <Badge variant="outline" className="w-fit">
            Em breve
          </Badge>
        </div>
      ) : (
        <>
          <div className="pt-5">
            <p className="rotulo-metrica">{destaque.rotulo}</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">
              <Valor valor={destaque.valor} inteiro={Math.abs(destaque.valor) >= 10_000} />
            </p>
            {destaque.operacoes ? (
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {formatarNumero(destaque.operacoes)} {destaque.operacoes === 1 ? "operação" : "operações"}
                {destaque.gains !== undefined ? ` · ${formatarPct(destaque.gains / destaque.operacoes, 0)} de acerto` : ""}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">sem operação fechada hoje</p>
            )}
          </div>

          <dl className="mt-3 flex gap-5 text-sm">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-xs text-muted-foreground">Mês</dt>
              <dd className="font-medium">
                <Valor valor={card.mes} inteiro={Math.abs(card.mes) >= 1000} />
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-xs text-muted-foreground">Acumulado</dt>
              <dd className="font-medium">
                <Valor valor={card.acumulado} inteiro={Math.abs(card.acumulado) >= 1000} />
              </dd>
            </div>
          </dl>

          <MiniCurva pontos={card.sparkline} altura={64} className="mt-4" />

          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              DD máx.{" "}
              <Valor valor={-card.drawdownMaximo} inteiro colorir={false} className="text-foreground" />
            </span>
            <span
              aria-hidden
              className="grid size-8 place-items-center rounded-full border border-(--painel-fio-forte) text-foreground transition-colors group-hover:bg-foreground group-hover:text-background"
            >
              <ArrowUpRight className="size-4" />
            </span>
          </div>
        </>
      )}
    </Link>
  );
});
