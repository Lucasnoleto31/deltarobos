"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { desempacotar, type OpsEmpacotadas } from "@/components/compartilhados/ops-codec";
import { Valor } from "@/components/compartilhados/Valor";
import { CurvaCapital } from "@/components/graficos/CurvaCapital";
import { formatarBRL, formatarData, formatarDuracao, formatarMesAno, formatarMultiplo, formatarNumero, formatarPct, formatarPontos } from "@/lib/formato";
import { heatmapAnoMes } from "@/lib/stats/calendario";
import { calcularKpis } from "@/lib/stats/kpis";
import {
  dia as diaDaOperacao,
  histograma,
  porDiaSemana,
  porHora,
  porSimbolo,
  resumoOperacoes,
  sequencias,
} from "@/lib/stats/operacoes";
import { dentroDoIntervalo, ehDia, ehPeriodo, filtrarIntervalo, intervaloDe, type Periodo } from "@/lib/stats/periodos";
import type { Base, LinhaDiaria, OpcoesSerie, Unidade } from "@/lib/stats/tipos";
import { CardsKpi, ListaKpi, type ItemKpi } from "./CardsKpi";
import { Filtros, type EstadoFiltros } from "./Filtros";
import { GraficoBarras } from "./GraficoBarras";
import { PorSimbolo } from "./PorSimbolo";

interface Props {
  slug: string;
  linhas: LinhaDiaria[];
  /** as operações empacotadas por ops-codec: 158 KB em vez de 699 KB no HTML (18/09/2026) */
  pacote: OpsEmpacotadas;
  hoje: string;
  valorPonto: number;
  capitalReferencia: number | null;
}

function lerEstado(sp: URLSearchParams, hoje: string): EstadoFiltros {
  const periodo: Periodo = ehPeriodo(sp.get("periodo")) ? (sp.get("periodo") as Periodo) : "tudo";
  const contratosBruto = Number.parseInt(sp.get("contratos") ?? "1", 10);
  return {
    periodo,
    de: ehDia(sp.get("de")) ? (sp.get("de") as string) : "",
    ate: ehDia(sp.get("ate")) ? (sp.get("ate") as string) : hoje,
    unidade: sp.get("unidade") === "pontos" ? "pontos" : "brl",
    base: sp.get("base") === "bruto" ? "bruto" : "liquido",
    contratos: Number.isFinite(contratosBruto) && contratosBruto >= 1 && contratosBruto <= 1000 ? contratosBruto : 1,
  };
}

function urlDe(e: EstadoFiltros, pathname: string, hoje: string): string {
  const p = new URLSearchParams();
  if (e.periodo !== "tudo") p.set("periodo", e.periodo);
  if (e.periodo === "personalizado") {
    if (e.de) p.set("de", e.de);
    if (e.ate && e.ate !== hoje) p.set("ate", e.ate);
  }
  if (e.unidade !== "brl") p.set("unidade", e.unidade);
  if (e.base !== "liquido") p.set("base", e.base);
  if (e.contratos !== 1) p.set("contratos", String(e.contratos));
  const qs = p.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function rotuloUnidade(v: number, unidade: Unidade): string {
  return unidade === "brl" ? formatarBRL(v, { inteiro: Math.abs(v) >= 1000 }) : `${formatarPontos(v)} pts`;
}

/** Aba Desempenho: um estado de filtros vale pra todas as seções. */
export function PainelDesempenho({
  slug,
  linhas,
  pacote,
  hoje,
  valorPonto,
  capitalReferencia,
}: Props) {
  const ops = useMemo(() => desempacotar(pacote), [pacote]);
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [estado, setEstado] = useState<EstadoFiltros>(() => lerEstado(sp, hoje));

  // estado -> URL (compartilhável), sem empurrar histórico
  useEffect(() => {
    const alvo = urlDe(estado, pathname, hoje);
    const atual = sp.size > 0 ? `${pathname}?${sp.toString()}` : pathname;
    if (alvo !== atual) router.replace(alvo, { scroll: false });
  }, [estado, pathname, hoje, router, sp]);

  const intervalo = useMemo(
    () => intervaloDe(estado.periodo, hoje, { de: estado.de || null, ate: estado.ate || null }),
    [estado.periodo, estado.de, estado.ate, hoje],
  );
  const opcoes = useMemo<OpcoesSerie & { base: Base; unidade: Unidade }>(
    () => ({ base: estado.base, unidade: estado.unidade, valorPonto, contratos: estado.contratos }),
    [estado.base, estado.unidade, estado.contratos, valorPonto],
  );

  const linhasF = useMemo(() => filtrarIntervalo(linhas, intervalo), [linhas, intervalo]);
  const opsF = useMemo(() => ops.filter((op) => dentroDoIntervalo(diaDaOperacao(op), intervalo)), [ops, intervalo]);

  const kpis = useMemo(() => calcularKpis(linhasF, opcoes, { hoje, capitalReferencia }), [linhasF, opcoes, hoje, capitalReferencia]);
  const resumo = useMemo(() => resumoOperacoes(opsF, opcoes), [opsF, opcoes]);
  const seq = useMemo(() => sequencias(opsF), [opsF]);
  const heatmap = useMemo(() => heatmapAnoMes(linhas, opcoes), [linhas, opcoes]);
  const mensal = useMemo(
    () => heatmap.flatMap((l) => l.meses.filter((m): m is NonNullable<typeof m> => m !== null)).map((m) => ({ rotulo: formatarMesAno(`${m.mes}-01`), valor: m.total, n: m.nDias, mes: m.mes })),
    [heatmap],
  );
  const porDia = useMemo(() => porDiaSemana(opsF, opcoes), [opsF, opcoes]);
  const porHoraF = useMemo(() => porHora(opsF, opcoes), [opsF, opcoes]);
  const hist = useMemo(() => histograma(opsF, opcoes, 12), [opsF, opcoes]);
  const simbolos = useMemo(() => porSimbolo(opsF, opcoes), [opsF, opcoes]);

  // clicar num mês nas barras filtra o painel inteiro naquele mês
  const verMes = (mes: string) => {
    const [ano, m] = mes.split("-").map(Number);
    const ultimo = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
    setEstado((s) => ({ ...s, periodo: "personalizado", de: `${mes}-01`, ate: ultimo < hoje ? ultimo : hoje }));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const retornoPct =
    estado.unidade === "brl" && capitalReferencia && capitalReferencia > 0
      ? kpis.acumulado / (capitalReferencia * estado.contratos)
      : null;

  const linkOperacoes = (() => {
    const p = new URLSearchParams();
    if (intervalo.de) p.set("de", intervalo.de);
    if (intervalo.ate && intervalo.ate !== hoje) p.set("ate", intervalo.ate);
    const qs = p.toString();
    return `/robos/${slug}/operacoes${qs ? `?${qs}` : ""}`;
  })();

  if (linhas.length === 0) {
    return (
      <p className="painel p-8 text-center text-sm text-muted-foreground">Sem operações fechadas ainda.</p>
    );
  }

  // a base dos percentuais: o capital de referência vezes os contratos do filtro (19/09/2026: o % do
  // drawdown e o do retorno apareciam sem dizer sobre quanto)
  const capitalDoFiltro = capitalReferencia && capitalReferencia > 0 ? formatarBRL(capitalReferencia * estado.contratos, { inteiro: true }) : null;

  // 19/09/2026: eram doze cartões iguais, com ícone. Ficam quatro cartões e os outros oito em lista,
  // como na visão geral. Todos os números e apoios continuam. Cada um com o "o que é" do glossário no
  // rótulo (info), no mesmo dia: "em todos os cards deve ter uma info sobre o que é".
  const principais: ItemKpi[] = [
    {
      rotulo: "Taxa de acerto",
      info: "taxaAcerto",
      valor: formatarPct(kpis.taxaAcerto),
      // espaço que não quebra: o número não se separa do rótulo na quebra de linha (19/09/2026)
      detalhe: (
        <>
          {formatarNumero(resumo.nGain)}&nbsp;gains · {formatarNumero(resumo.nLoss)}&nbsp;losses
        </>
      ),
    },
    { rotulo: "Fator de lucro", info: "fatorLucro", valor: formatarMultiplo(kpis.fatorLucro), detalhe: kpis.fatorLucro !== null ? `${formatarMultiplo(kpis.fatorLucro)} de ganho para cada 1 de perda` : undefined },
    {
      rotulo: "Drawdown máx.",
      // o número é o % do capital quando há capital; sem ele, o R$
      info: kpis.drawdownMaximoPct !== null ? "drawdownPct" : "drawdown",
      valor: kpis.drawdownMaximoPct !== null ? formatarPct(kpis.drawdownMaximoPct) : <Valor valor={-kpis.drawdown.valor} unidade={estado.unidade} inteiro={kpis.drawdown.valor >= 1000} />,
      detalhe:
        kpis.drawdownMaximoPct !== null && capitalDoFiltro !== null
          ? estado.unidade === "brl"
            ? `${rotuloUnidade(-kpis.drawdown.valor, "brl")} sobre capital de ${capitalDoFiltro}`
            : `${rotuloUnidade(-kpis.drawdown.valor, "pontos")} · capital ${capitalDoFiltro}`
          : kpis.drawdown.fundo
            ? `fundo em ${formatarData(kpis.drawdown.fundo)}`
            : undefined,
    },
    { rotulo: "Média mensal", info: "mediaMensal", valor: <Valor valor={kpis.mediaMensal} unidade={estado.unidade} inteiro={Math.abs(kpis.mediaMensal) >= 1000} />, detalhe: `${formatarNumero(kpis.nMeses)} ${kpis.nMeses === 1 ? "mês" : "meses"}` },
  ];
  // em pares no lg: ganho e perda, payoff e ritmo, melhor e pior dia, dias e sequência
  const demais: ItemKpi[] = [
    { rotulo: "Ganho médio", info: "ganhoMedio", valor: <Valor valor={resumo.mediaGain} unidade={estado.unidade} />, detalhe: `maior ${rotuloUnidade(resumo.maiorGain, estado.unidade)}` },
    { rotulo: "Perda média", info: "perdaMedia", valor: <Valor valor={resumo.mediaLoss} unidade={estado.unidade} />, detalhe: `maior ${rotuloUnidade(resumo.maiorLoss, estado.unidade)}` },
    { rotulo: "Payoff", info: "payoff", valor: formatarMultiplo(kpis.payoff), detalhe: kpis.payoff !== null ? `o ganho médio é ${formatarPct(kpis.payoff, 0)} da perda média` : undefined },
    // o total de operações está na linha do número grande; aqui fica o ritmo (a média de 1 casa, que
    // a linha mostrava, no lugar do arredondado do antigo cartão) e a duração, que só a linha tinha
    { rotulo: "Operações por dia", info: "operacoesDia", valor: formatarNumero(resumo.mediaPorDia, 1), detalhe: `duração média ${formatarDuracao(resumo.duracaoMediaSeg)}` },
    { rotulo: "Melhor dia", info: "melhorDia", valor: kpis.melhorDia ? <Valor valor={kpis.melhorDia.valor} unidade={estado.unidade} inteiro={Math.abs(kpis.melhorDia.valor) >= 1000} /> : "–", detalhe: kpis.melhorDia ? formatarData(kpis.melhorDia.dia) : undefined },
    { rotulo: "Pior dia", info: "piorDia", valor: kpis.piorDia ? <Valor valor={kpis.piorDia.valor} unidade={estado.unidade} inteiro={Math.abs(kpis.piorDia.valor) >= 1000} /> : "–", detalhe: kpis.piorDia ? formatarData(kpis.piorDia.dia) : undefined },
    // contagem de dias, não resultado em dinheiro: numa cor só (19/09/2026, era verde × vermelho)
    { rotulo: "Dias positivos × negativos", info: "diasPositivosNegativos", valor: <>{formatarNumero(kpis.diasPositivos)}<span className="text-muted-foreground"> × </span>{formatarNumero(kpis.diasNegativos)}</>, detalhe: `${formatarNumero(kpis.nDias)} dias de pregão` },
    // contagem de operações, não resultado: numa cor só e numa linha só (antes quebrava em três cores)
    {
      rotulo: "Maior sequência",
      info: "maiorSequencia",
      valor: (
        <>
          {formatarNumero(seq.maiorGains)}&nbsp;gains · {formatarNumero(seq.maiorLosses)}&nbsp;losses
        </>
      ),
      detalhe: "operação a operação",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Número grande. O rótulo em caixa alta que ficava em cima saiu (19/09/2026): o contexto vem
          numa linha embaixo, sem repetir acerto e fator de lucro, que estão nos cartões. */}
      <header className="space-y-2">
        <p className="text-5xl font-semibold tracking-tight sm:text-6xl">
          <Valor valor={kpis.acumulado} unidade={estado.unidade} />
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">
          <strong className="font-medium text-foreground">{formatarNumero(resumo.n)}</strong> operações · {formatarNumero(estado.contratos)}{" "}
          {estado.contratos === 1 ? "contrato" : "contratos"} · {estado.base === "liquido" ? "líquido de custos" : "bruto"}
          {retornoPct !== null ? (
            <>
              {" "}
              · retorno <strong className={retornoPct >= 0 ? "font-medium text-positivo" : "font-medium text-negativo"}>{formatarPct(retornoPct, 2)}</strong> sobre {capitalDoFiltro}
            </>
          ) : null}
        </p>
      </header>

      <Filtros estado={estado} onChange={(patch) => setEstado((s) => ({ ...s, ...patch }))} hoje={hoje} linkOperacoes={linkOperacoes} />

      <div className="space-y-3">
        <CardsKpi itens={principais} className="sm:grid-cols-2 lg:grid-cols-4" />
        <ListaKpi itens={demais} />
      </div>

      <section className="painel p-4 sm:p-5">
        {/* o i dos gráficos também (19/09/2026): o nome sozinho não diz a um leigo o que a curva mostra */}
        <h2 className="mb-3 font-semibold">
          <RotuloComInfo chave="curvaCapital">Curva de capital</RotuloComInfo>
        </h2>
        {/* sem o resumo em cima (19/09/2026): resultado, drawdown e dias já estão no número grande e
            nos cartões, como na visão geral */}
        <CurvaCapital linhas={linhasF} opcoes={opcoes} operacoes={opsF} mostrarResumo={false} />
      </section>

      {/* 19/09/2026: saíram o mapa "Ano × mês" (o mesmo da aba Calendário, e as barras daqui já
          escolhem o mês) e a seção de risco: o risco fica só na aba Risco, em R$ líquido de 1
          contrato, Mês/Ano/Tudo. */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="painel p-4 sm:p-5">
          <h2 className="font-semibold">
            <RotuloComInfo chave="resultadoMensal">Resultado mensal</RotuloComInfo>
          </h2>
          {/* as barras vêm do histórico inteiro: com outro período no filtro, isso muda a leitura */}
          {estado.periodo !== "tudo" ? <p className="text-xs text-muted-foreground">Todo o histórico, sem o filtro de período</p> : null}
          <div className="mt-3">
            <GraficoBarras dados={mensal} unidade={estado.unidade} rotuloN="Dias de pregão" aoEscolher={(i) => verMes(mensal[i].mes)} />
          </div>
        </section>
        <section className="painel p-4 sm:p-5">
          <h2 className="mb-3 font-semibold">
            <RotuloComInfo chave="porAtivo">Resultado por ativo</RotuloComInfo>
          </h2>
          <PorSimbolo faixas={simbolos} unidade={estado.unidade} />
        </section>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Distribuição</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="painel p-4">
            <h3 className="mb-2 text-sm font-medium">
              <RotuloComInfo chave="porDiaSemana">Por dia da semana</RotuloComInfo>
            </h3>
            <GraficoBarras dados={porDia.map((f) => ({ rotulo: f.rotulo, valor: f.total, n: f.n }))} unidade={estado.unidade} altura={200} />
          </div>
          <div className="painel p-4">
            <h3 className="mb-2 text-sm font-medium">
              <RotuloComInfo chave="porHora">Por hora de entrada</RotuloComInfo>
            </h3>
            <GraficoBarras dados={porHoraF.map((f) => ({ rotulo: f.rotulo, valor: f.total, n: f.n }))} unidade={estado.unidade} altura={200} />
          </div>
          <div className="painel p-4">
            <h3 className="mb-2 text-sm font-medium">
              <RotuloComInfo chave="histograma">Resultado por operação</RotuloComInfo>
            </h3>
            <GraficoBarras
              dados={hist.map((f) => ({
                rotulo: rotuloUnidade((f.de + f.ate) / 2, estado.unidade),
                valor: f.n,
                tom: (f.de + f.ate) / 2 >= 0 ? "positivo" : "negativo",
              }))}
              unidade={estado.unidade}
              altura={200}
              contagem
            />
          </div>
        </div>
      </section>
    </div>
  );
}
