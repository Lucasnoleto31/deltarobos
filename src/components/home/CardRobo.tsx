"use client";

import { cn } from "cn";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { BadgeStatusRobo } from "@/components/compartilhados/BadgeStatusRobo";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
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
 * (19/09/2026). A entrada dura 500 ms
 * só na animação: o duration-500 esticava também o hover do .painel-interativo, que é de 180 ms.
 *
 * 19/09/2026 (Artur: "em todos os cards deve ter uma info sobre o que é"): cada número ganhou o i do
 * glossário. Botão dentro de link é inválido, então o cartão deixou de ser um <a>: o link é o nome do
 * robô, e o ::after dele cobre o cartão inteiro (link esticado), com o mesmo hover, a seta e o anel de
 * foco no cartão. Os i e o selo ficam por cima (z-10): o i abre a explicação e o selo mostra o title. Com
 * o link só no nome, o selo volta a levar a definição para leitor de tela.
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
    <article
      style={{ animationDelay: `${atraso}ms` }}
      className={cn(
        "group relative flex h-full flex-col painel vidro painel-interativo p-5 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring/50",
        // os i ficam acima do ::after do link (o InfoIndicador já é relative)
        "[&_button]:z-10",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:animation-duration-500 motion-safe:[--tw-ease:cubic-bezier(0.16,1,0.3,1)]",
        emBreve && "opacity-80",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold leading-tight">
            <Link href={`/robos/${card.slug}`} className="outline-none after:absolute after:inset-0">
              {card.nome}
            </Link>
          </h3>
          <p className="text-xs text-muted-foreground">
            {card.ativoNome} · {card.ativo}
          </p>
        </div>
        <BadgeStatusRobo status={status} className="relative z-10" />
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
            <p className="rotulo-metrica">
              <RotuloComInfo chave="resultadoDia">{destaque.rotulo}</RotuloComInfo>
            </p>
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

          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-xs text-muted-foreground">
                <RotuloComInfo chave="mesAtual">Mês</RotuloComInfo>
              </dt>
              <dd className="font-medium">
                <Valor valor={card.mes} inteiro={Math.abs(card.mes) >= 1000} />
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-xs text-muted-foreground">
                <RotuloComInfo chave="acumulado">Acumulado</RotuloComInfo>
              </dt>
              <dd className="font-medium">
                <Valor valor={card.acumulado} inteiro={Math.abs(card.acumulado) >= 1000} />
              </dd>
            </div>
          </dl>

          <MiniCurva pontos={card.sparkline} altura={64} className="mt-4" />

          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              <RotuloComInfo chave="drawdown">DD máx.</RotuloComInfo>{" "}
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
    </article>
  );
});
