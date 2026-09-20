"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ChaveIndicador } from "@/components/compartilhados/glossario";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import { ListaKpi, type ItemKpi } from "@/components/desempenho/CardsKpi";
import { mistura } from "@/components/graficos/base";
import { formatarBRL, formatarData, formatarMultiplo, formatarNumero, formatarPct } from "@/lib/formato";
import { calcularKpis } from "@/lib/stats/kpis";
import type { PeriodoPainel } from "@/components/robo/ops-por-periodo";
import { inicioDoPeriodo } from "@/components/robo/periodos-resumo";
import { filtrarIntervalo, type Intervalo } from "@/lib/stats/periodos";
import {
  calmar,
  capitalMinimoRecomendado,
  distribuicaoProfundidade,
  episodiosDrawdown,
  recoveryFactor,
  resumoDiario,
  riscoDeRuina,
  tempoEmDrawdown,
  ulcerIndex,
} from "@/lib/stats/risco";
import { curvaAcumulada, valorDia } from "@/lib/stats/serie";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";
import { AbaixoDoPico } from "./AbaixoDoPico";

interface Props {
  linhas: LinhaDiaria[];
  /** perda média por operação (resumoOperacoes().mediaLoss) de cada período, calculada na página */
  perdaMedia: Record<PeriodoPainel, number>;
  hoje: string;
  valorPonto: number;
  capitalReferencia: number | null;
  margem: number | null;
  fatorSeguranca: number;
}

// os mesmos atalhos das outras abas; sem "hoje" e "semana", que não têm drawdown para medir
const OPCOES_PERIODO: ReadonlyArray<{ valor: PeriodoPainel; rotulo: string }> = [
  { valor: "mes", rotulo: "Mês" },
  { valor: "ano", rotulo: "Ano" },
  { valor: "tudo", rotulo: "Tudo" },
];

/** Uma das três colunas do bloco de capital: rótulo (com o "o que é"), número e a linha que liga ele aos outros dois. */
function CelulaCapital({
  rotulo,
  info,
  children,
  detalhe,
}: {
  rotulo: string;
  info: ChaveIndicador;
  children: React.ReactNode;
  detalhe: React.ReactNode;
}) {
  return (
    <div className="border-(--painel-fio) p-4 not-first:border-t sm:p-5 sm:not-first:border-t-0 sm:not-first:border-l">
      <p className="rotulo-metrica">
        <RotuloComInfo chave={info}>{rotulo}</RotuloComInfo>
      </p>
      <p className="mt-2 text-xl leading-none font-semibold tracking-tight tabular-nums sm:text-2xl">{children}</p>
      <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">{detalhe}</p>
    </div>
  );
}

/** Aba Risco: capital e drawdown, índices de risco, gráfico abaixo do pico, maiores drawdowns e, embaixo, profundidade, piores dias e resumo diário. */
export function PainelRisco({ linhas, perdaMedia, hoje, valorPonto, capitalReferencia, margem, fatorSeguranca }: Props) {
  const [periodo, setPeriodo] = useState<PeriodoPainel>("tudo");
  const opcoes = useMemo<OpcoesSerie>(() => ({ base: "liquido", unidade: "brl", valorPonto }), [valorPonto]);
  const intervalo = useMemo<Intervalo>(() => ({ de: inicioDoPeriodo(periodo, hoje), ate: hoje }), [periodo, hoje]);
  const linhasF = useMemo(() => filtrarIntervalo(linhas, intervalo), [linhas, intervalo]);

  const kpis = useMemo(() => calcularKpis(linhasF, opcoes, { hoje, capitalReferencia }), [linhasF, opcoes, hoje, capitalReferencia]);
  const curva = useMemo(() => curvaAcumulada(linhasF, opcoes), [linhasF, opcoes]);
  const episodios = useMemo(() => episodiosDrawdown(curva, Infinity), [curva]);
  const mediaLoss = perdaMedia[periodo];
  const diario = useMemo(() => resumoDiario(curva, episodios), [curva, episodios]);
  const profundidade = useMemo(() => distribuicaoProfundidade(episodios, capitalReferencia), [episodios, capitalReferencia]);
  const piores = useMemo(
    () => linhasF.map((l) => ({ dia: l.dia, valor: valorDia(l, opcoes), n: l.n_operacoes })).sort((a, b) => a.valor - b.valor).slice(0, 5),
    [linhasF, opcoes],
  );

  const dd = kpis.drawdown.valor;
  const temCapital = Boolean(capitalReferencia && capitalReferencia > 0);
  const vCalmar = calmar(kpis.acumulado, kpis.nDias, dd);
  const vRecovery = recoveryFactor(kpis.acumulado, dd);
  const vUlcer = ulcerIndex(curva, capitalReferencia);
  const vTempo = tempoEmDrawdown(curva);
  const vRuina = riscoDeRuina({ taxaAcerto: kpis.taxaAcerto, payoff: kpis.payoff, capital: capitalReferencia, perdaMedia: mediaLoss });
  const capitalMinimo = margem !== null ? capitalMinimoRecomendado(margem, dd, fatorSeguranca) : null;

  if (linhas.length === 0) {
    return <p className="painel p-8 text-center text-sm text-muted-foreground">Sem operações fechadas ainda.</p>;
  }

  const ddBrl = formatarBRL(dd, { inteiro: dd >= 1000 });
  const fator = formatarMultiplo(fatorSeguranca, 1);
  // 19/09/2026 ("o risco de ruína está zero, pq?"): o apoio diz quantas perdas médias cabem no capital, as
  // "unidades" da conta na metodologia (capital ÷ perda média). A fórmula eleva a razão de perda a esse
  // número; com centenas de perdas médias no capital, o resultado arredonda para 0,0%. Inteiras, para baixo.
  const perdasNoCapital = capitalReferencia && mediaLoss !== 0 ? Math.floor(capitalReferencia / Math.abs(mediaLoss)) : null;

  // 19/09/2026: eram nove cartões iguais em duas fileiras. Drawdown, capital de referência e capital
  // mínimo foram para o bloco de cima; os outros seis ficam em lista, em pares no lg. Cada um com o
  // "o que é" do glossário no rótulo (info).
  const indices: ItemKpi[] = [
    {
      rotulo: "Tempo de recuperação",
      info: "tempoRecuperacao",
      valor: dd === 0 ? "–" : kpis.drawdown.diasAteRecuperar !== null ? `${formatarNumero(kpis.drawdown.diasAteRecuperar)} dias` : "em recuperação",
      detalhe:
        kpis.drawdown.inicio && kpis.drawdown.recuperacao
          ? `maior drawdown, de ${formatarData(kpis.drawdown.inicio)} a ${formatarData(kpis.drawdown.recuperacao)}`
          : kpis.drawdown.inicio
            ? `maior drawdown, desde ${formatarData(kpis.drawdown.inicio)}`
            : undefined,
    },
    {
      rotulo: "Tempo em drawdown",
      info: "tempoEmDrawdown",
      valor: formatarPct(vTempo, 0),
      detalhe: `${formatarNumero(curva.filter((p) => p.drawdown < 0).length)} de ${formatarNumero(curva.length)} pregões abaixo do pico`,
    },
    { rotulo: "Calmar", info: "calmar", valor: formatarMultiplo(vCalmar), detalhe: "retorno anualizado ÷ drawdown máximo" },
    { rotulo: "Recovery factor", info: "recoveryFactor", valor: formatarMultiplo(vRecovery), detalhe: "resultado ÷ drawdown máximo" },
    { rotulo: "Ulcer index", info: "ulcer", valor: formatarNumero(vUlcer, 2), detalhe: temCapital ? "profundidade média, em % do capital" : "profundidade média, em R$/contrato" },
    {
      rotulo: "Risco de ruína",
      info: "riscoRuina",
      valor: vRuina === null ? "–" : formatarPct(vRuina, 1),
      // sem perda no período a conta também não sai: aí o motivo não é o capital
      detalhe:
        vRuina === null
          ? temCapital
            ? "sem perdas no período"
            : "precisa de capital de referência"
          : perdasNoCapital !== null
            ? `capital de ${formatarBRL(capitalReferencia ?? 0, { inteiro: true })} cobre ${formatarNumero(perdasNoCapital)} perdas médias de ${formatarBRL(Math.abs(mediaLoss), { inteiro: Math.abs(mediaLoss) >= 1000 })}`
            : undefined,
    },
  ];

  const recuperacaoMedia = diario.recuperacaoMediaDias !== null ? `${formatarNumero(diario.recuperacaoMediaDias)} dias` : "–";

  return (
    <div className="space-y-6">
      {/* O título "Risco" repetia a aba (19/09/2026); fica a base dos números e o link da metodologia,
          que antes vinha no fim da seção de risco do Desempenho. */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Líquido de custos, 1 contrato ·{" "}
          <Link href="/metodologia#drawdown" className="underline underline-offset-4 hover:text-foreground">
            metodologia
          </Link>
        </p>
        <Segmentado ariaLabel="Período" opcoes={OPCOES_PERIODO} valor={periodo} onChange={setPeriodo} />
      </header>

      <div className="space-y-3">
        {/* Um bloco só para os três (19/09/2026): o % do drawdown é sobre o capital de referência, e o
            capital mínimo é a margem mais o drawdown × fator. Lado a lado, a conta fica à vista. */}
        <section aria-label="Drawdown e capital" className="painel grid sm:grid-cols-3">
          <CelulaCapital
            rotulo="Drawdown máximo"
            info={temCapital ? "drawdownPct" : "drawdown"}
            detalhe={temCapital ? `${formatarBRL(-dd, { inteiro: dd >= 1000, sinal: true })} sobre o capital de referência` : "sem capital de referência"}
          >
            {temCapital ? formatarPct(kpis.drawdownMaximoPct, 1) : <Valor valor={-dd} inteiro={dd >= 1000} />}
          </CelulaCapital>
          <CelulaCapital rotulo="Capital de referência" info="capitalReferencia" detalhe={capitalReferencia ? "base dos percentuais" : "não configurado"}>
            {capitalReferencia ? formatarBRL(capitalReferencia, { inteiro: true }) : "–"}
          </CelulaCapital>
          <CelulaCapital
            rotulo="Capital mínimo · 1 contrato"
            info="capitalMinimo"
            detalhe={capitalMinimo !== null ? `margem ${formatarBRL(margem ?? 0, { inteiro: true })} + drawdown ${ddBrl} × ${fator}` : "margem de referência não configurada"}
          >
            {capitalMinimo !== null ? formatarBRL(capitalMinimo, { inteiro: true }) : "–"}
          </CelulaCapital>
        </section>

        <ListaKpi itens={indices} />
      </div>

      {/* 19/09/2026: saiu a linha da direita ("máx … · recuperação média …"), que repetia o bloco de
          cima e o Resumo diário; o capital também já está no bloco de cima */}
      <section className="painel p-4 sm:p-5">
        <div className="mb-3">
          <h2 className="font-semibold">
            <RotuloComInfo chave="abaixoDoPico">Abaixo do pico, dia a dia</RotuloComInfo>
          </h2>
          <p className="text-xs text-muted-foreground">{temCapital ? "em % do capital" : "em R$ por contrato"}</p>
        </div>
        <AbaixoDoPico curva={curva} capitalReferencia={capitalReferencia} />
      </section>

      {/* 19/09/2026: sem a coluna "01–10" (a ordem é a do valor) e com a de dias, que só a seção de
          risco do Desempenho tinha: até recuperar, ou até o fundo com "+" quando ainda aberto. Na
          largura toda (a Distribuição do lado deixava um vão embaixo dela) e com o valor logo depois do
          início: no celular a rolagem escondia o R$ atrás das três datas. */}
      <section className="overflow-x-auto painel">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">
            <RotuloComInfo chave="maioresDrawdowns">Maiores drawdowns</RotuloComInfo>
          </h2>
        </div>
        {episodios.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum drawdown no período.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                <th>Início</th>
                <th className="text-right">R$</th>
                {temCapital ? <th className="text-right">%</th> : null}
                <th className="text-right">Dias</th>
                <th className="text-right">Status</th>
                <th>Fundo</th>
                <th>Recuperação</th>
              </tr>
            </thead>
            <tbody className="[&>tr]:border-t">
              {episodios.slice(0, 10).map((e) => (
                <tr key={`${e.inicio}-${e.fundo}`} className="tabular-nums [&>td]:px-3 [&>td]:py-2">
                  <td>{formatarData(e.inicio)}</td>
                  <td className="text-right text-negativo">{formatarBRL(e.valor, { inteiro: e.valor >= 1000 })}</td>
                  {temCapital ? <td className="text-right text-negativo">{formatarPct(e.valor / (capitalReferencia as number), 1)}</td> : null}
                  <td className="text-right">{e.diasAteRecuperar !== null ? formatarNumero(e.diasAteRecuperar) : `${formatarNumero(e.diasAteFundo)}+`}</td>
                  {/* recuperado não é resultado: sem verde (19/09/2026) */}
                  <td className="text-right">{e.recuperacao ? <span className="text-muted-foreground">Recuperado</span> : <span className="text-alerta">Aberto</span>}</td>
                  <td>{formatarData(e.fundo)}</td>
                  <td>{e.recuperacao ? formatarData(e.recuperacao) : <span className="text-alerta">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* profundidade, piores dias e resumo diário lado a lado no lg: alturas parecidas (19/09/2026) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="painel p-4">
          <h2 className="font-semibold">
            <RotuloComInfo chave="profundidade">Distribuição por profundidade</RotuloComInfo>
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {formatarNumero(episodios.length)} drawdowns no período{temCapital ? ", em % do capital" : ", em R$ por contrato"}
          </p>
          <ul className="space-y-2.5 text-sm">
            {profundidade.map((f, i) => {
              const maior = Math.max(1, ...profundidade.map((x) => x.n));
              return (
                <li key={f.rotulo} className="flex items-center gap-3">
                  <span className="w-20 text-muted-foreground tabular-nums">{f.rotulo}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-muted">
                    {/* 19/09/2026: um tom só, o do negativo, mais forte quanto mais funda a faixa (era
                        verde, laranja e vermelho, e verde fica para resultado) */}
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${f.n > 0 ? Math.max(3, Math.round((f.n / maior) * 100)) : 0}%`,
                        background: mistura("--negativo", 35 + Math.round((65 * i) / Math.max(1, profundidade.length - 1))),
                      }}
                    />
                  </div>
                  <span className="w-8 text-right font-semibold tabular-nums">{formatarNumero(f.n)}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="painel p-4">
          <h2 className="mb-3 font-semibold">
            <RotuloComInfo chave="pioresDias">5 piores dias</RotuloComInfo>
          </h2>
          <ol className="space-y-2.5">
            {piores.map((p) => {
              const maior = Math.max(1, ...piores.map((x) => Math.abs(x.valor)));
              return (
                <li key={p.dia} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium tabular-nums">
                      {formatarData(p.dia)} <span className="text-xs font-normal text-muted-foreground">{formatarNumero(p.n)} op</span>
                    </span>
                    <Valor valor={p.valor} inteiro={Math.abs(p.valor) >= 1000} className="font-semibold" />
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-muted">
                    <div className="h-1 rounded-full bg-negativo" style={{ width: `${Math.max(3, Math.round((Math.abs(p.valor) / maior) * 100))}%` }} />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="painel p-4">
          <h2 className="mb-3 font-semibold">Resumo diário</h2>
          {/* na coluna de um terço o valor quebra: encostado à direita e com folga do rótulo (19/09/2026) */}
          <dl className="divide-y text-sm [&>div]:gap-2 [&_dd]:text-right">
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted-foreground">
                <RotuloComInfo chave="diasNegativos">Dias negativos</RotuloComInfo>
              </dt>
              <dd className="tabular-nums">
                <strong>
                  {formatarNumero(diario.diasNegativos)} de {formatarNumero(diario.nDias)}
                </strong>{" "}
                <span className="text-xs text-muted-foreground">{formatarPct(diario.fracaoNegativa, 0)}</span>
              </dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted-foreground">
                <RotuloComInfo chave="sequenciaDiasNegativos">Sequência negativa máxima</RotuloComInfo>
              </dt>
              <dd className="tabular-nums">
                <strong>{formatarNumero(diario.maiorSequenciaNegativa)} dias</strong> <span className="text-xs text-muted-foreground">consecutivos</span>
              </dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted-foreground">
                <RotuloComInfo chave="volatilidade">Volatilidade diária</RotuloComInfo>
              </dt>
              <dd className="tabular-nums">
                <strong>{formatarBRL(diario.volatilidade, { inteiro: diario.volatilidade >= 1000 })}</strong> <span className="text-xs text-muted-foreground">desvio padrão</span>
              </dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted-foreground">
                <RotuloComInfo chave="recuperacaoMedia">Recuperação média</RotuloComInfo>
              </dt>
              <dd className="tabular-nums">
                <strong>{recuperacaoMedia}</strong>{" "}
                <span className="text-xs text-muted-foreground">{formatarNumero(diario.episodiosRecuperados)} drawdowns recuperados</span>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
