"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import { ListaKpi, type ItemKpi } from "@/components/desempenho/CardsKpi";
import { GraficoResultado } from "@/components/graficos/GraficoResultado";
import type { PeriodoPainel } from "@/components/robo/ops-por-periodo";
import { VAZIO_DO_PERIODO, inicioDoPeriodo } from "@/components/robo/periodos-resumo";
import { linkSimulador } from "@/components/simulador/simulador-url";
import { Indicador, Indicadores } from "@/components/sistema/Indicadores";
import { Fato, Fatos, NumeroGrande } from "@/components/sistema/Numero";
import { LINK_DO_PAINEL, Painel } from "@/components/sistema/Painel";
import { formatarBRL, formatarData, formatarDataCurta, formatarDataLonga, formatarMultiplo, formatarNumero, formatarPct } from "@/lib/formato";
import { calcularKpis } from "@/lib/stats/kpis";
import { filtrarIntervalo, filtrarPeriodo, type Intervalo } from "@/lib/stats/periodos";
import { calmar, capitalMinimoRecomendado, episodiosDrawdown, recoveryFactor, resumoDiario, riscoDeRuina, ulcerIndex } from "@/lib/stats/risco";
import { curvaAcumulada, drawdownMaximo } from "@/lib/stats/serie";
import { maiorQueda } from "@/lib/stats/serie-casa";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";
import { AbaixoDoPico } from "./AbaixoDoPico";

interface Props {
  /** o robô, para o link "Simular com meu capital" chegar ao simulador já com ele marcado (23/09/2026) */
  slug: string;
  linhas: LinhaDiaria[];
  /** perda média por operação (resumoOperacoes().mediaLoss) de cada período, calculada na página */
  perdaMedia: Record<PeriodoPainel, number>;
  hoje: string;
  valorPonto: number;
  capitalReferencia: number | null;
  margem: number | null;
  fatorSeguranca: number;
}

// os mesmos atalhos das outras abas; sem "hoje" e "semana", que não têm queda para medir
const OPCOES_PERIODO: ReadonlyArray<{ valor: PeriodoPainel; rotulo: string }> = [
  { valor: "mes", rotulo: "Mês" },
  { valor: "ano", rotulo: "Ano" },
  { valor: "tudo", rotulo: "Tudo" },
];

// quantas quedas a tabela lista, depois da maior: as pequenas não mudam a resposta da tela
const OUTRAS_QUEDAS = 5;

// A altura da curva nesta aba. O padrão do GraficoResultado foi pensado para a página inicial; aqui há o
// cabeçalho do robô e as abas em cima e a faixa "abaixo do topo" embaixo, então a curva fica mais baixa para
// o número, o gráfico e o começo da tabela caberem na primeira tela.
const ALTURA_DA_CURVA = { "--alt-curva": "clamp(12rem, calc(100dvh - 45rem), 24rem)" } as React.CSSProperties;

const dias = (n: number) => `${formatarNumero(n)} ${n === 1 ? "dia" : "dias"}`;

/** "08/07 a 02/09/2026"; com a virada do ano no meio, as duas datas inteiras. */
const intervaloDeDatas = (de: string, ate: string) =>
  de.slice(0, 4) === ate.slice(0, 4) ? `${formatarDataCurta(de)} a ${formatarData(ate)}` : `${formatarData(de)} a ${formatarData(ate)}`;

/** "novembro de 2026" */
const mesPorExtenso = (dia: string) => new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Aba "Quedas e risco" (ficha Mesa, 25/11/2026). Responde a uma pergunta: quanto este robô já caiu, quanto
 * tempo levou para se recuperar e quanto capital é preciso para aguentar.
 *
 * - O número grande é a maior queda do período, em vermelho, com o que ela é e a premissa escritos embaixo.
 *   Ao lado, quatro fatos: quanto tempo caiu, quanto tempo levou para recuperar (ou "ainda não recuperou"), o
 *   pior dia e em quantos pregões o resultado esteve abaixo do topo.
 * - O gráfico é a curva do período com essa queda em vermelho (GraficoResultado) e, colada embaixo, no mesmo
 *   eixo de tempo, a faixa de quanto o resultado ficou abaixo do topo em cada dia (AbaixoDoPico). Passar o
 *   ponteiro troca o número grande pelo quanto o robô estava abaixo do topo naquele pregão.
 * - Depois, as outras quedas em tabela (a maior já está no alto); o capital (mínimo sugerido, de referência e
 *   quanto dele a maior queda levou) em números lado a lado; e "Mais números" em lista, cada um com o apoio
 *   em português simples.
 *
 * O que saiu, por repetir a tela ou por não fazer falta: a distribuição por profundidade (a tabela das quedas
 * já mostra os tamanhos), os 5 piores dias (ficou o pior, nos fatos), os dias negativos e a sequência negativa
 * (estão em Desempenho), a coluna de status da tabela (a de "voltou ao topo" já diz), a de % do capital e a
 * linha da maior queda, que repetia o número grande. O gráfico "abaixo do pico" deixou de ser um bloco à
 * parte, em % e com leitura própria. Os rótulos não levam mais o "o que é" do glossário: cada número tem a
 * explicação escrita ao lado, sem a palavra drawdown.
 *
 * As contas não mudaram: calcularKpis, curvaAcumulada, episodiosDrawdown, resumoDiario e os índices de
 * lib/stats/risco. O trecho em vermelho da curva vem de maiorQueda (lib/stats/serie-casa), a mesma conta da
 * página inicial.
 */
export function PainelRisco({ slug, linhas, perdaMedia, hoje, valorPonto, capitalReferencia, margem, fatorSeguranca }: Props) {
  const [periodo, setPeriodo] = useState<PeriodoPainel>("tudo");
  const [apontado, setApontado] = useState<number | null>(null);
  const opcoes = useMemo<OpcoesSerie>(() => ({ base: "liquido", unidade: "brl", valorPonto }), [valorPonto]);
  const intervalo = useMemo<Intervalo>(() => ({ de: inicioDoPeriodo(periodo, hoje), ate: hoje }), [periodo, hoje]);
  const linhasF = useMemo(() => filtrarIntervalo(linhas, intervalo), [linhas, intervalo]);

  const kpis = useMemo(() => calcularKpis(linhasF, opcoes, { hoje, capitalReferencia }), [linhasF, opcoes, hoje, capitalReferencia]);
  const curva = useMemo(() => curvaAcumulada(linhasF, opcoes), [linhasF, opcoes]);
  // o trecho da curva que vai em vermelho: do topo ao fundo da maior queda
  const queda = useMemo(() => maiorQueda(curva), [curva]);
  // 23/09/2026: o capital mínimo é a regra da spec §7, sem período (margem + maior queda de TODO o histórico
  // × fator), o mesmo número por contrato que o simulador usa. Antes seguia o período escolhido, e em "Ano"
  // mostrava um mínimo menor que o "mín. por contrato" do link "Simular com meu capital".
  const ddTudo = useMemo(() => drawdownMaximo(curvaAcumulada(filtrarPeriodo(linhas, "tudo", hoje), opcoes)).valor, [linhas, hoje, opcoes]);
  const episodios = useMemo(() => episodiosDrawdown(curva, Infinity), [curva]);
  const diario = useMemo(() => resumoDiario(curva, episodios), [curva, episodios]);
  const mediaLoss = perdaMedia[periodo];

  if (linhas.length === 0) {
    return <p className="text-sm text-muted-foreground">{VAZIO_DO_PERIODO.tudo}</p>;
  }

  const dd = kpis.drawdown.valor;
  // a maior queda com as datas e as durações: é a primeira da lista, que vem ordenada pelo tamanho. As outras
  // vão para a tabela; a maior não entra nela, porque já é o número grande e os fatos do alto da tela.
  const maior = episodios[0] ?? null;
  const outras = episodios.slice(1);
  const temCapital = Boolean(capitalReferencia && capitalReferencia > 0);
  const vCalmar = calmar(kpis.acumulado, kpis.nDias, dd);
  const vRecovery = recoveryFactor(kpis.acumulado, dd);
  const vUlcer = ulcerIndex(curva, capitalReferencia);
  const vRuina = riscoDeRuina({ taxaAcerto: kpis.taxaAcerto, payoff: kpis.payoff, capital: capitalReferencia, perdaMedia: mediaLoss });
  const capitalMinimo = margem !== null ? capitalMinimoRecomendado(margem, ddTudo, fatorSeguranca) : null;
  const abaixoDoTopo = curva.filter((p) => p.drawdown < 0).length;

  // o índice apontado pode ter ficado de uma série mais longa (troca de período com o ponteiro parado)
  const lido = apontado !== null ? (curva[apontado] ?? null) : null;

  const quando =
    periodo === "tudo"
      ? curva.length > 0
        ? `desde ${formatarDataLonga(curva[0].dia)}`
        : ""
      : periodo === "ano"
        ? `em ${hoje.slice(0, 4)}`
        : `em ${mesPorExtenso(hoje)}`;

  const brl = (v: number) => formatarBRL(v, { inteiro: Math.abs(v) >= 1000 });

  // 19/09/2026 ("o risco de ruína está zero, pq?"): o apoio diz quantas perdas médias cabem no capital, as
  // "unidades" da conta na metodologia (capital ÷ perda média). A fórmula eleva a razão de perda a esse
  // número; com centenas de perdas médias no capital, o resultado arredonda para 0,0%. Inteiras, para baixo.
  const perdasNoCapital = capitalReferencia && mediaLoss !== 0 ? Math.floor(capitalReferencia / Math.abs(mediaLoss)) : null;

  // "Mais números": só entra o que a conta conseguiu fechar no período; número sem valor não vira traço na tela
  const mais: ItemKpi[] = [];
  if (diario.recuperacaoMediaDias !== null) {
    mais.push({
      rotulo: "Tempo médio para recuperar",
      valor: `${formatarNumero(diario.recuperacaoMediaDias)} dias`,
      detalhe:
        diario.episodiosRecuperados === 1
          ? "a única queda que já voltou ao topo"
          : `média das ${formatarNumero(diario.episodiosRecuperados)} quedas que já voltaram ao topo`,
    });
  }
  if (diario.nDias > 1) {
    mais.push({
      rotulo: "Variação de um dia para o outro",
      valor: brl(diario.volatilidade),
      detalhe: "o quanto o resultado de um dia costuma se afastar da média dos dias (volatilidade)",
    });
  }
  if (vCalmar !== null) {
    mais.push({ rotulo: "Calmar", valor: formatarMultiplo(vCalmar), detalhe: "o ganho de um ano, no ritmo do período, dividido pela maior queda" });
  }
  if (vRecovery !== null) {
    mais.push({ rotulo: "Fator de recuperação", valor: formatarMultiplo(vRecovery), detalhe: "quantas vezes o resultado do período cobre a maior queda" });
  }
  if (dd > 0) {
    mais.push({
      rotulo: "Índice de úlcera",
      valor: formatarNumero(vUlcer, 2),
      detalhe: `tamanho e duração das quedas num número só, ${temCapital ? "em % do capital de referência" : "em R$"}; quanto menor, mais estável`,
    });
  }
  if (vRuina !== null) {
    mais.push({
      rotulo: "Risco de ruína",
      valor: formatarPct(vRuina, 1),
      // a ressalva vinha no "o que é" do glossário; sem ela, 0,0% ao lado de uma queda grande engana
      detalhe: `chance estimada de perder todo o capital de referência${
        perdasNoCapital !== null ? `, que cobre ${formatarNumero(perdasNoCapital)} perdas médias de ${brl(Math.abs(mediaLoss))}` : ""
      }${vRuina < 0.01 ? "; como as perdas reais vêm juntas em dias ruins, a conta pode dar perto de zero mesmo com queda grande" : ""}`,
    });
  }

  // os números do capital: o mínimo e o de referência não dependem do período; a parte que a maior queda levou, sim
  const pctDoCapital = temCapital && dd > 0 ? kpis.drawdownMaximoPct : null;
  const quantosDoCapital = (capitalMinimo !== null ? 1 : 0) + (temCapital ? 1 : 0) + (pctDoCapital !== null ? 1 : 0);

  return (
    <div className="space-y-10">
      <section aria-labelledby="risco-titulo">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 lg:pr-20">
          <h2 id="risco-titulo" className="text-[0.9375rem] font-normal text-muted-foreground">
            Maior queda
          </h2>
          {/* o período fica alinhado à borda direita da curva, como na página inicial */}
          <Segmentado ariaLabel="Período" opcoes={OPCOES_PERIODO} valor={periodo} onChange={setPeriodo} />
        </div>

        {curva.length === 0 ? (
          <p className="py-12 text-sm text-muted-foreground">{VAZIO_DO_PERIODO[periodo]}</p>
        ) : (
          <>
            {/* lado a lado só a partir de xl: os fatos daqui são mais largos que os da página inicial, e entre
                1024 e 1280 px a coluna do número ficaria espremida */}
            <div className="mt-3 grid gap-x-16 gap-y-6 xl:grid-cols-[minmax(0,auto)_minmax(0,26rem)] xl:items-end xl:justify-start">
              <div className="min-w-0">
                <NumeroGrande valor={lido ? lido.drawdown : dd > 0 ? -dd : 0} />
                {/* a primeira linha diz o que é o número (e é a que muda com o ponteiro); a segunda, a premissa */}
                <p className="mt-3 text-sm text-muted-foreground">
                  {lido ? (
                    <>
                      {formatarData(lido.dia)} ·{" "}
                      {lido.drawdown < 0 ? (lido.pico > 0 ? `abaixo do topo de ${brl(lido.pico)}` : "abaixo do ponto de partida") : "no topo"}
                    </>
                  ) : dd > 0 ? (
                    "do ponto mais alto ao mais baixo que veio depois"
                  ) : (
                    "o resultado não recuou nenhuma vez"
                  )}
                </p>
                <p className="text-sm text-pretty text-sutil">
                  com 1 contrato, já descontados os custos{quando ? ` · ${quando}` : ""}
                </p>
              </div>

              {maior ? (
                <Fatos className="max-w-[26rem] xl:pb-0.5">
                  <Fato rotulo="Tempo caindo">
                    <span className="mr-3 text-sutil">{intervaloDeDatas(maior.inicio, maior.fundo)}</span>
                    <span className="font-medium whitespace-nowrap">{dias(maior.diasAteFundo)}</span>
                  </Fato>
                  <Fato rotulo="Tempo até recuperar">
                    {maior.recuperacao && maior.diasAteRecuperar !== null ? (
                      <>
                        <span className="mr-3 text-sutil">em {formatarData(maior.recuperacao)}</span>
                        <span className="font-medium whitespace-nowrap">{dias(maior.diasAteRecuperar)}</span>
                      </>
                    ) : (
                      <span className="font-medium text-alerta">ainda não recuperou</span>
                    )}
                  </Fato>
                  {kpis.piorDia && kpis.piorDia.valor < 0 ? (
                    <Fato rotulo="Pior dia">
                      <span className="mr-3 text-sutil">{formatarData(kpis.piorDia.dia)}</span>
                      <Valor valor={kpis.piorDia.valor} inteiro={Math.abs(kpis.piorDia.valor) >= 1000} className="font-medium" />
                    </Fato>
                  ) : null}
                  <Fato rotulo="Dias abaixo do topo">
                    <span className="font-medium">{formatarNumero(abaixoDoTopo)}</span>
                    <span className="text-muted-foreground"> de {formatarNumero(curva.length)}</span>
                  </Fato>
                </Fatos>
              ) : null}
            </div>

            <div style={ALTURA_DA_CURVA}>
              <GraficoResultado dias={curva} queda={queda} ativo={apontado} aoApontar={setApontado} className="mt-8" />
            </div>
            <AbaixoDoPico curva={curva} ativo={apontado} aoApontar={setApontado} className="mt-1" />
            {queda && curva.length > 1 ? (
              <p className="mt-3 text-[0.8125rem] text-pretty text-sutil lg:pr-20">
                Em <span className="text-negativo">vermelho</span> na curva, a maior queda. Embaixo, quanto o resultado ficou abaixo do topo (o ponto mais
                alto até ali) em cada dia.
              </p>
            ) : null}
          </>
        )}
      </section>

      {/* As outras quedas, da maior para a menor. 19/09/2026: o valor vem logo depois da primeira data, porque
          no celular a rolagem escondia o R$ atrás das datas; recuperada não é resultado, então não leva verde.
          Desde a ficha Mesa (25/11/2026) é uma .tbl sem caixa, sem a coluna de status (a de "voltou ao topo"
          já diz) e sem a maior queda, que está no alto. */}
      {outras.length > 0 ? (
        <Painel
          id="quedas"
          titulo="Outras quedas"
          apoio={`${formatarNumero(outras.length)} no período${outras.length > OUTRAS_QUEDAS ? `, as ${OUTRAS_QUEDAS} maiores` : ""}`}
          fio={false}
          corpo="pt-1"
          className="lg:pr-20"
        >
          <div className="tbl-moldura">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Começou em</th>
                  <th className="num">Queda</th>
                  <th className="num">Fundo em</th>
                  <th className="num">Voltou ao topo em</th>
                  <th className="num">Tempo até recuperar</th>
                </tr>
              </thead>
              <tbody>
                {outras.slice(0, OUTRAS_QUEDAS).map((e) => (
                  <tr key={`${e.inicio}-${e.fundo}`}>
                    <td className="whitespace-nowrap">{formatarData(e.inicio)}</td>
                    <td className="num">
                      {/* sem centavos em toda a coluna, para os valores alinharem */}
                      <Valor valor={-e.valor} inteiro className="font-medium" />
                    </td>
                    <td className="num">{formatarData(e.fundo)}</td>
                    <td className="num">{e.recuperacao ? formatarData(e.recuperacao) : <span className="text-alerta">ainda não</span>}</td>
                    {/* a queda que ainda não voltou conta os dias até o fundo: dali para cima é "mais de" */}
                    <td className="num">{e.diasAteRecuperar !== null ? dias(e.diasAteRecuperar) : `mais de ${dias(e.diasAteFundo)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>
      ) : null}

      {/* Os números do capital lado a lado (19/09/2026: a conta fica à vista; a parte do capital que a maior
          queda levou é sobre o capital de referência, e o mínimo é a margem mais a maior queda × fator). O link
          do simulador, que ficava debaixo do capital mínimo (23/09/2026), foi para o cabeçalho da seção. */}
      {quantosDoCapital > 0 ? (
        <Painel
          id="capital"
          titulo="Quanto capital é preciso"
          apoio="para operar 1 contrato"
          acao={
            <Link href={linkSimulador(slug)} className={LINK_DO_PAINEL}>
              Simular com meu capital
            </Link>
          }
          fio={false}
          corpo="pt-3"
          className="lg:pr-20"
        >
          <Indicadores colunas={quantosDoCapital === 3 ? 3 : 2}>
            {capitalMinimo !== null ? (
              <Indicador
                rotulo="Capital mínimo sugerido"
                valor={formatarBRL(capitalMinimo, { inteiro: true })}
                apoio={`a garantia que a corretora exige (${formatarBRL(margem ?? 0, { inteiro: true })}) mais a maior queda de todo o histórico (${formatarBRL(ddTudo, { inteiro: true })}) multiplicada por ${formatarMultiplo(fatorSeguranca, 1)}`}
              />
            ) : null}
            {temCapital ? (
              <Indicador
                rotulo="Capital de referência"
                valor={formatarBRL(capitalReferencia ?? 0, { inteiro: true })}
                apoio="o tamanho de conta usado como base para 1 contrato"
              />
            ) : null}
            {pctDoCapital !== null ? (
              <Indicador
                rotulo="Maior queda sobre esse capital"
                valor={<span className="text-negativo">{formatarPct(pctDoCapital, 1)}</span>}
                apoio={`a parte do capital de referência que a maior queda levou${quando ? `, ${quando}` : ""}`}
              />
            ) : null}
          </Indicadores>
        </Painel>
      ) : null}

      {mais.length > 0 ? (
        <Painel
          id="mais-numeros"
          titulo="Mais números"
          acao={
            <Link href="/metodologia#drawdown" className={LINK_DO_PAINEL}>
              Como a conta é feita
            </Link>
          }
          corpo=""
          className="lg:pr-20"
        >
          <ListaKpi itens={mais} />
        </Painel>
      ) : null}
    </div>
  );
}
