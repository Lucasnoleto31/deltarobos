"use client";

import { useMemo, useState } from "react";
import { AtualizadoHa } from "@/components/compartilhados/AtualizadoHa";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import { CurvaCapital } from "@/components/graficos/CurvaCapital";
import { expandirSerie, type SerieCompacta } from "@/components/graficos/series-da-curva";
import { formatarBRL, formatarData, formatarDataLonga, formatarNumero, formatarPct } from "@/lib/formato";
import { calcularKpis } from "@/lib/stats/kpis";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";
import { HojeAoVivo } from "./HojeAoVivo";
import {
  PERIODOS_RESUMO,
  TITULO_DO_PERIODO,
  VAZIO_DO_PERIODO,
  noPeriodo,
  periodoInicial,
  type PeriodoFechado,
  type PeriodoResumo,
} from "./periodos-resumo";
import { usePregaoAberto, useRobo } from "./RoboAoVivoProvider";

interface Props {
  /** a série diária inteira; o recorte por período é feito aqui */
  linhas: LinhaDiaria[];
  /** a curva por operação de cada período, já reduzida aos pontos do desenho (montada no servidor, só os números) */
  pontosPorOperacao: Record<PeriodoFechado, SerieCompacta>;
  valorPonto: number;
  capitalReferencia: number | null;
}

/**
 * O painel que abre a visão geral: "Hoje" ao vivo e, nas outras abas, o resultado da semana, do mês,
 * do ano e desde o início, com a curva de capital ao lado (18/09/2026, Artur: "faltam filtros, hoje,
 * semana, mes, tudo"). Antes eram dois blocos separados, "Hoje ao vivo" e "Curva de capital", sem
 * recorte. Os números vêm de calcularKpis sobre a série diária recortada; a curva, de CurvaCapital.
 * Desde 19/09/2026 não abre sempre em "Hoje": fora do pregão e sem operação no dia, abre no primeiro
 * período com operação (periodoInicial). Enquanto a pessoa não toca no filtro, a escolha acompanha o
 * pregão: abriu ou chegou operação, volta para "Hoje". Robô sem coletor (só histórico importado) não
 * tem dia ao vivo: para ele o pregão aberto não conta, nem no período inicial nem no "ao vivo" do título.
 */
export function PainelResultado({ linhas, pontosPorOperacao, valorPonto, capitalReferencia }: Props) {
  const { estado, robo, hoje } = useRobo();
  const aberto = usePregaoAberto();
  const aoVivo = aberto && robo.tem_coletor;
  const operacoesHoje = estado.operacoes.length;
  const automatico = useMemo(
    () => periodoInicial(linhas, hoje, { operacoesHoje, pregaoAberto: aoVivo }),
    [linhas, hoje, operacoesHoje, aoVivo],
  );
  const [escolhido, setEscolhido] = useState<PeriodoResumo | null>(null);
  const periodo = escolhido ?? automatico;
  const atualizadoEm = estado.ultimaMensagemEm ?? estado.ultimoHeartbeatEm;

  return (
    <section aria-labelledby="resultado" className="painel">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id="resultado" className="font-semibold">
            {/* "ao vivo" só com o pregão aberto e coletor: no sábado o painel é o dia parado */}
            {periodo === "hoje" ? (aoVivo ? "Hoje ao vivo" : "Hoje") : TITULO_DO_PERIODO[periodo]}
          </h2>
          {periodo === "hoje" ? (
            <p className="text-xs text-muted-foreground">
              <span className="first-letter:uppercase">{formatarDataLonga(hoje)}</span>
              {/* sem coletor não há sinal: "atualizado sem dados" não diz nada (19/09/2026) */}
              {robo.tem_coletor ? (
                <>
                  {" · "}
                  <AtualizadoHa em={atualizadoEm} />
                </>
              ) : null}
            </p>
          ) : (
            <Subtitulo linhas={noPeriodo(linhas, periodo, hoje)} />
          )}
        </div>
        <Segmentado ariaLabel="Período do resultado" opcoes={PERIODOS_RESUMO} valor={periodo} onChange={setEscolhido} />
      </div>

      {periodo === "hoje" ? (
        <HojeAoVivo />
      ) : (
        <ResultadoDoPeriodo
          key={periodo}
          periodo={periodo}
          linhas={linhas}
          serie={pontosPorOperacao[periodo]}
          valorPonto={valorPonto}
          capitalReferencia={capitalReferencia}
          hoje={hoje}
        />
      )}
    </section>
  );
}

/** "de 15/09/2026 a 18/09/2026 · 4 pregões" */
function Subtitulo({ linhas }: { linhas: LinhaDiaria[] }) {
  if (linhas.length === 0) return null;
  const dias = linhas.map((l) => l.dia).sort();
  const n = dias.length;
  return (
    <p className="text-xs text-muted-foreground tabular-nums">
      {n === 1 ? formatarData(dias[0]) : `de ${formatarData(dias[0])} a ${formatarData(dias[n - 1])}`} · {formatarNumero(n)}{" "}
      {n === 1 ? "pregão" : "pregões"}
    </p>
  );
}

/** Um azulejo por número, como nos painéis de trading: rótulo pequeno, valor, apoio embaixo. */
function Azulejo({ rotulo, detalhe, children, className }: { rotulo: string; detalhe?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-(--painel-fio) px-3 py-2.5 ${className ?? ""}`}>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-1 text-base font-semibold tabular-nums">{children}</dd>
      {detalhe ? <dd className="text-[11px] text-muted-foreground tabular-nums">{detalhe}</dd> : null}
    </div>
  );
}

function ResultadoDoPeriodo({
  periodo,
  linhas,
  serie,
  valorPonto,
  capitalReferencia,
  hoje,
}: {
  periodo: PeriodoFechado;
  linhas: LinhaDiaria[];
  serie: SerieCompacta;
  valorPonto: number;
  capitalReferencia: number | null;
  hoje: string;
}) {
  const opcoes = useMemo<OpcoesSerie>(() => ({ base: "liquido", unidade: "brl", valorPonto }), [valorPonto]);
  const recorte = useMemo(() => noPeriodo(linhas, periodo, hoje), [linhas, periodo, hoje]);
  const k = useMemo(() => calcularKpis(recorte, opcoes, { hoje, capitalReferencia }), [recorte, opcoes, hoje, capitalReferencia]);
  // a dica de cada ponto é escrita aqui, com as mesmas funções que o servidor usava (240 pontos, custo nulo)
  const pontos = useMemo(() => expandirSerie(serie, opcoes), [serie, opcoes]);

  if (recorte.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{VAZIO_DO_PERIODO[periodo]}</p>;
  }

  const pontosDoPeriodo = recorte.reduce((s, l) => s + l.pontos_por_contrato, 0);
  const bruto = recorte.reduce((s, l) => s + l.resultado_brl_por_contrato, 0);

  return (
    <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1fr_1.6fr] lg:items-start motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
      <div className="space-y-5">
        {/* sem rótulo em cima do número (19/09/2026): ele repetia o título ("Resultado da semana, por
            contrato"); o "por contrato" foi para a linha de custos */}
        <div>
          <p className="text-4xl font-semibold tracking-tight sm:text-5xl">
            <Valor valor={k.acumulado} inteiro={Math.abs(k.acumulado) >= 10_000} />
          </p>
          <p className="mt-1.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
            <Valor valor={pontosDoPeriodo} unidade="pontos" colorir={false} className="text-foreground" />
            <span className="tabular-nums">
              {formatarNumero(k.nOperacoes)} {k.nOperacoes === 1 ? "operação" : "operações"}
            </span>
            {k.nOperacoes > 0 ? (
              <span className="tabular-nums">
                {formatarNumero(k.nGain)}/{formatarNumero(k.nOperacoes)} gains
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Por contrato, líquido de custos (bruto{" "}
            <Valor valor={bruto} inteiro={Math.abs(bruto) >= 10_000} colorir={false} className="text-muted-foreground" />
            ).
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-2">
          {/* como nas abas Desempenho e Risco (19/09/2026): % do capital de referência no número; embaixo o
              R$ e o capital, senão o % parece a conta inteira */}
          <Azulejo
            rotulo="Drawdown máximo"
            detalhe={
              k.drawdown.valor === 0
                ? undefined
                : k.drawdownMaximoPct !== null && capitalReferencia
                  ? `${formatarBRL(-k.drawdown.valor, { inteiro: k.drawdown.valor >= 1000, sinal: true })} sobre capital de ${formatarBRL(capitalReferencia, { inteiro: true })}`
                  : k.drawdown.fundo
                    ? `fundo em ${formatarData(k.drawdown.fundo)}`
                    : undefined
            }
          >
            {k.drawdown.valor === 0 ? (
              <span className="text-muted-foreground">nenhum</span>
            ) : k.drawdownMaximoPct !== null ? (
              formatarPct(k.drawdownMaximoPct)
            ) : (
              <Valor valor={-k.drawdown.valor} inteiro={k.drawdown.valor >= 1000} />
            )}
          </Azulejo>
          <Azulejo rotulo="Taxa de acerto" detalhe={`${formatarNumero(k.nGain)} gains · ${formatarNumero(k.nLoss)} losses`}>
            {formatarPct(k.taxaAcerto)}
          </Azulejo>
          <Azulejo rotulo="Melhor dia" detalhe={k.melhorDia ? formatarData(k.melhorDia.dia) : undefined}>
            {k.melhorDia ? <Valor valor={k.melhorDia.valor} /> : "–"}
          </Azulejo>
          <Azulejo rotulo="Pior dia" detalhe={k.piorDia ? formatarData(k.piorDia.dia) : undefined}>
            {k.piorDia ? <Valor valor={k.piorDia.valor} /> : "–"}
          </Azulejo>
          {/* 19/09/2026: contagem de dias, não dinheiro, então uma cor só; sem "5 pregões" embaixo, que o
              subtítulo do painel já diz */}
          <Azulejo rotulo="Dias positivos × negativos" className="col-span-2">
            {formatarNumero(k.diasPositivos)}
            <span className="text-muted-foreground"> × </span>
            {formatarNumero(k.diasNegativos)}
          </Azulejo>
        </dl>
      </div>

      <div className="min-w-0">
        <CurvaCapital
          linhas={recorte}
          opcoes={opcoes}
          altura={330}
          mostrarResumo={false}
          pontosPorOperacao={pontos}
          // semana e mês têm poucos pregões: a curva por operação é a que mostra alguma coisa
          modoInicial={periodo === "semana" || periodo === "mes" ? "operacao" : "dia"}
        />
      </div>
    </div>
  );
}
