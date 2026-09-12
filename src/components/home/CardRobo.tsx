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
}

export function CardRobo({ card, status }: Props) {
  const emBreve = card.status === "em_breve";

  return (
    <Link
      href={`/robos/${card.slug}`}
      className={cn(
        "group flex h-full flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-shadow hover:ring-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/50 outline-none",
        emBreve && "opacity-80",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold leading-tight">{card.nome}</h3>
          <p className="text-xs text-muted-foreground">
            {card.ativoNome} · {card.ativo}
          </p>
        </div>
        <BadgeStatusRobo status={status} />
      </div>

      {emBreve ? (
        <div className="flex flex-1 flex-col justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {card.descricao ?? "Estatísticas disponíveis assim que o robô entrar em operação."}
          </p>
          <Badge variant="outline" className="w-fit">
            Em breve
          </Badge>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Hoje</dt>
              <dd className="font-semibold">
                <Valor valor={card.hoje} inteiro={Math.abs(card.hoje) >= 1000} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Mês</dt>
              <dd className="font-semibold">
                <Valor valor={card.mes} inteiro={Math.abs(card.mes) >= 1000} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Acumulado</dt>
              <dd className="font-semibold">
                <Valor valor={card.acumulado} inteiro={Math.abs(card.acumulado) >= 1000} />
              </dd>
            </div>
          </dl>

          <MiniCurva pontos={card.sparkline} />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              DD máx.{" "}
              <Valor valor={-card.drawdownMaximo} inteiro colorir={false} className="text-foreground" />
            </span>
            <span className="inline-flex items-center gap-0.5 transition-colors group-hover:text-foreground">
              Ver robô <ArrowUpRight className="size-3.5" />
            </span>
          </div>
        </>
      )}
    </Link>
  );
}
