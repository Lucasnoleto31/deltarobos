import { Valor } from "@/components/compartilhados/Valor";
import { MiniCurva } from "@/components/graficos/MiniCurva";
import { Simbolo } from "@/components/marca/Simbolo";
import { NumeroGrande } from "@/components/sistema/Numero";
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
 * O robô para colar em outros sites via iframe (spec §8.8). Leve, sem tempo real: sai pronto do servidor.
 *
 * Desde a ficha Mesa (25/11/2026) é a mesma composição das telas do sistema, em ponto pequeno e sem caixa
 * (a caixa é o próprio iframe): o nome e a marca numa linha; o resultado dos últimos 30 dias em número
 * grande, com a premissa embaixo; a curva desses mesmos 30 dias, com a maior queda em vermelho; e uma
 * fileira de fatos com um fio em cima (hoje, desde o início e a maior queda de todo o histórico: onde
 * aparece ganho, aparece o risco). Eram três números iguais lado a lado (hoje, mês, acumulado), uma etiqueta
 * em pílula e uma curva verde com a área preenchida. O mês saiu: no fim do mês ele repetia o número dos 30
 * dias. A etiqueta "Ao vivo" também: o embed não tem tempo real, e o site não promete o que não sabe. "Conta
 * demo" continua escrito, sempre.
 *
 * O bloco inteiro é um link para a página do robô, que abre em outra aba.
 */
export function CardEmbed({ robo, resumo, hoje, linkSite }: Props) {
  const emBreve = robo.status === "em_breve";
  const pregoes = resumo.sparkline.length;
  // o número grande é o fim da curva desenhada logo abaixo: o acumulado dos últimos 30 dias (resumirCardRobo)
  const noPeriodo = pregoes > 0 ? resumo.sparkline[pregoes - 1] : 0;
  const inteiro = (v: number) => Math.abs(v) >= 1000;
  // os rótulos vão no cinza de apoio, e não no terceiro nível: o embed também é servido no tema claro
  // (?tema=claro), onde o terceiro nível dá 3,8:1 sobre o branco

  return (
    <a href={linkSite} target="_blank" rel="noopener noreferrer" className="group block outline-none">
      <div className="flex items-baseline justify-between gap-4">
        <p className="min-w-0 truncate">
          <span className="text-[1.0625rem] font-medium tracking-[-0.01em] group-hover:underline group-focus-visible:underline">{robo.nome}</span>
          <span className="ml-2.5 text-[0.8125rem] text-muted-foreground">{robo.ativo_nome}</span>
          {robo.conta_tipo === "demo" ? <span className="ml-2.5 text-[0.8125rem] text-alerta">conta demo</span> : null}
        </p>
        <p className="flex shrink-0 items-center gap-1.5 self-center text-[0.8125rem] font-medium">
          <Simbolo aria-hidden className="h-3.5 w-auto text-marca" />
          <span>
            Quants <span className="font-normal text-muted-foreground">Robôs</span>
          </span>
        </p>
      </div>

      {emBreve || resumo.nDias === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{emBreve ? "Em breve. Os números aparecem quando a primeira operação fechar." : "Ainda sem operações."}</p>
      ) : (
        <>
          {/* 30 dias sem operação não viram um zero em número grande: o período aparece em palavras */}
          {pregoes > 0 ? (
            <>
              <NumeroGrande valor={noPeriodo} centavos={!inteiro(noPeriodo)} className="mt-3" />
              <p className="mt-2 text-[0.8125rem] text-pretty text-muted-foreground">
                nos últimos 30 dias, com 1 contrato, já descontados os custos · {formatarData(hoje)}
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm text-pretty text-muted-foreground">Sem operação nos últimos 30 dias · {formatarData(hoje)}</p>
          )}

          {pregoes >= 2 ? <MiniCurva pontos={resumo.sparkline} altura={44} className="mt-3 text-foreground" /> : null}

          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-0.5 border-t border-(--painel-fio) pt-2.5 text-[0.8125rem] leading-6">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-muted-foreground">Hoje</dt>
              <dd className="font-medium">
                {resumo.ultimoDia === hoje ? <Valor valor={resumo.hoje} inteiro={inteiro(resumo.hoje)} /> : <span className="font-normal text-muted-foreground">sem operação</span>}
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-muted-foreground">Desde o início</dt>
              <dd className="font-medium">
                <Valor valor={resumo.acumulado} inteiro={inteiro(resumo.acumulado)} />
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-muted-foreground">Maior queda</dt>
              <dd className="font-medium">
                {resumo.drawdownMaximo > 0 ? (
                  <Valor valor={-resumo.drawdownMaximo} inteiro={inteiro(resumo.drawdownMaximo)} />
                ) : (
                  <span className="font-normal text-muted-foreground">nenhuma</span>
                )}
              </dd>
            </div>
          </dl>
        </>
      )}
    </a>
  );
}
