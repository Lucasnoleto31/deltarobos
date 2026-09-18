"use client";

import { cn } from "cn";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { BadgeStatusRobo } from "@/components/compartilhados/BadgeStatusRobo";
import { Valor } from "@/components/compartilhados/Valor";
import { MiniCurva } from "@/components/graficos/MiniCurva";
import { Badge } from "@/components/ui/badge";
import type { StatusAoVivo } from "@/lib/stats/status-robo";
import type { DadosCardRobo } from "./tipos";

interface Props {
  card: DadosCardRobo;
  status: StatusAoVivo;
  /** ms de atraso da entrada, para a grade aparecer em cascata */
  atraso?: number;
}

/**
 * O cartão do robô na home, refeito em 18/09/2026 ("os cards ainda estão feios"): um número por vez.
 * Em cima o nome e o estado; no meio o resultado de HOJE, grande, com o mês e o acumulado embaixo em
 * apoio; a curva dos 30 dias ocupa a largura toda; no pé, o drawdown máximo e o botão redondo que leva
 * ao robô. O cartão inteiro é o link. Entra com um leve deslize de baixo para cima, em cascata.
 */
export function CardRobo({ card, status, atraso = 0 }: Props) {
  const emBreve = card.status === "em_breve";

  return (
    <Link
      href={`/robos/${card.slug}`}
      style={{ animationDelay: `${atraso}ms` }}
      className={cn(
        "group flex h-full flex-col painel painel-interativo p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:duration-500",
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
        <BadgeStatusRobo status={status} />
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
            <p className="rotulo-metrica">Hoje</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">
              <Valor valor={card.hoje} inteiro={Math.abs(card.hoje) >= 10_000} />
            </p>
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
}
