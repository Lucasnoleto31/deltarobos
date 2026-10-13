import { ArrowUpRight } from "lucide-react";
import { classesDoTom } from "@/components/compartilhados/BadgeStatusRobo";
import { Valor } from "@/components/compartilhados/Valor";
import { MiniCurva } from "@/components/graficos/MiniCurva";
import { Simbolo } from "@/components/marca/Simbolo";
import { Badge } from "@/components/ui/badge";
import { corDoRobo } from "@/lib/cores-robo";
import { formatarData } from "@/lib/formato";
import type { ResumoCardRobo } from "@/lib/stats/resumo-robo";
import type { RoboPublico } from "@/lib/tipos";

interface Props {
  robo: RoboPublico;
  resumo: ResumoCardRobo;
  hoje: string;
  linkSite: string;
}

/**
 * Card do robô pra colar em outros sites via iframe. Leve, sem realtime.
 *
 * Mídia kit da Zeve (13/10/2026): o robô tem a cor dele (corDoRobo, pela ordem do banco, nunca pelo slug) no
 * ponto ao lado do nome e na curva dos 30 dias, como o card da home; "Ao vivo" é estado, então vai no acento
 * (a pílula do BadgeStatusRobo, com o contraste medido lá); os valores pintam pelo sinal (Valor); a marca no pé
 * leva o "Z". A altura é a de antes: quem cola o iframe fixa a altura dele.
 */
export function CardEmbed({ robo, resumo, hoje, linkSite }: Props) {
  const emBreve = robo.status === "em_breve";
  const aoVivo = !emBreve && robo.conta_tipo !== "demo" && robo.status === "ativo";
  return (
    <a
      href={linkSite}
      target="_blank"
      rel="noopener noreferrer"
      className="block painel p-4 painel-interativo"
      style={{ "--cor-robo": corDoRobo(robo.ordem) } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-lg font-semibold leading-tight">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-(--cor-robo)" />
            <span className="truncate">{robo.nome}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {robo.ativo_nome} · {robo.ativo}
          </p>
        </div>
        <Badge variant="outline" className={classesDoTom(aoVivo ? "info" : "neutro")}>
          {emBreve ? "Em breve" : robo.conta_tipo === "demo" ? "Conta demo" : robo.status === "ativo" ? "Ao vivo" : robo.status}
        </Badge>
      </div>

      {emBreve ? (
        <p className="mt-3 text-sm text-muted-foreground">Sem operações ainda.</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Hoje</dt>
              <dd className="font-semibold">
                <Valor valor={resumo.hoje} inteiro={Math.abs(resumo.hoje) >= 1000} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Mês</dt>
              <dd className="font-semibold">
                <Valor valor={resumo.mes} inteiro={Math.abs(resumo.mes) >= 1000} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Acumulado</dt>
              <dd className="font-semibold">
                <Valor valor={resumo.acumulado} inteiro={Math.abs(resumo.acumulado) >= 1000} />
              </dd>
            </div>
          </dl>
          <MiniCurva pontos={resumo.sparkline} altura={40} className="mt-3" cor={corDoRobo(robo.ordem)} />
        </>
      )}

      <p className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>por contrato, líquido · {formatarData(hoje)}</span>
        {/* 19/09/2026: a seta de texto virou o ícone de link externo (o card abre o site em outra aba) */}
        <span className="inline-flex items-center gap-1">
          <Simbolo aria-hidden className="h-2.5 w-auto" />
          Quants Robôs
          <ArrowUpRight className="size-3" aria-hidden="true" />
        </span>
      </p>
    </a>
  );
}
