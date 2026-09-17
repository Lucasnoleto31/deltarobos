import { Valor } from "@/components/compartilhados/Valor";
import { MiniCurva } from "@/components/graficos/MiniCurva";
import { Badge } from "@/components/ui/badge";
import { formatarData } from "@/lib/formato";
import type { ResumoCardRobo } from "@/lib/stats/resumo-robo";
import type { RoboPublico } from "@/lib/tipos";

interface Props {
  robo: RoboPublico;
  resumo: ResumoCardRobo;
  hoje: string;
  linkSite: string;
}

/** Card do robô pra colar em outros sites via iframe. Leve, sem realtime. */
export function CardEmbed({ robo, resumo, hoje, linkSite }: Props) {
  const emBreve = robo.status === "em_breve";
  return (
    <a
      href={linkSite}
      target="_blank"
      rel="noopener noreferrer"
      className="block painel p-4 painel-interativo"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold leading-tight">{robo.nome}</p>
          <p className="text-xs text-muted-foreground">
            {robo.ativo_nome} · {robo.ativo}
          </p>
        </div>
        <Badge variant="outline">
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
          <MiniCurva pontos={resumo.sparkline} altura={40} className="mt-3" />
        </>
      )}

      <p className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>por contrato, líquido · {formatarData(hoje)}</span>
        <span>Delta Robôs →</span>
      </p>
    </a>
  );
}
