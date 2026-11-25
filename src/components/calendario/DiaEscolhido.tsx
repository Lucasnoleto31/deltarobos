"use client";

import { cn } from "cn";
import { useId, useMemo } from "react";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { Valor } from "@/components/compartilhados/Valor";
import { CompartilharDia } from "@/components/compartilhar/CompartilharDia";
import { versaoDoCard } from "@/components/compartilhar/url-do-card";
import { CURVA_POR_OPERACAO, DesenhoDaCurva, MolduraProfit } from "@/components/graficos/CurvaProfit";
import { PONTOS_LEVE, baldesDoPregao, janelaDosDados, legendaCurtaDoSaldo, rotulosDeTempo, serieDoSaldoParaDesenho, seriePorOperacao } from "@/components/graficos/series-da-curva";
import { LINK_DO_PAINEL } from "@/components/sistema/Painel";
import { formatarBRL, formatarData, formatarHora, formatarNumero } from "@/lib/formato";
import { mepMenDoDia, type ExposicaoDoDia } from "@/lib/stats/exposicao";
import { excursaoDoDia, valorOperacao, type OperacaoCompacta } from "@/lib/stats/operacoes";
import type { HorarioPregao } from "@/lib/stats/pregao";
import { inicioDaMedicao, liquidarSerie, reduzirBaldes } from "@/lib/stats/saldo-dia";
import type { OpcoesSerie } from "@/lib/stats/tipos";
import type { SaldoDoDia } from "@/lib/tipos";

interface Props {
  /** o dia escolhido no calendário (YYYY-MM-DD) */
  dia: string;
  /** as operações desse dia, em ordem de fechamento */
  ops: OperacaoCompacta[];
  opcoes: OpcoesSerie;
  /** a medição do EA para o dia (MEP/MEN tick a tick), quando existe */
  exposicao: ExposicaoDoDia | undefined;
  /** custo por contrato do robô: o líquido do MEP/MEN medido desconta o custo de cada saída até o extremo */
  custoPorContrato: number;
  valorPonto: number;
  /** o horário que dimensiona o eixo do tempo da série: o do robô, ou o do pregão do ativo */
  horario: HorarioPregao;
  /** a série do saldo medida pelo EA: ainda não pedida ou no ar (undefined), a resposta, ou "erro" */
  saldo: SaldoDoDia | "erro" | undefined;
  carregando: boolean;
  aoTentarDeNovo: (dia: string) => void;
  slug: string;
  nomeRobo: string;
  contaDemo: boolean;
  /** a seção, para o calendário rolar até aqui quando o detalhe fica embaixo dele */
  ref?: React.Ref<HTMLElement>;
  className?: string;
}

// o "o que é" do melhor e do pior momento muda com a fonte do dia (22/09/2026). 25/11/2026: "o coletor subiu"
// e "extremo" eram palavras de quem fez o sistema; a ressalva diz a mesma coisa em palavras de quem lê
const PARCIAL = " Parcial: a medição começou com o dia em andamento e pode ter perdido um ponto anterior.";
const TEXTO_MEP = {
  ea: (parcial: boolean) =>
    `O ponto mais alto que o saldo do dia alcançou, já com custos, medido no MetaTrader 5 a cada movimento do preço, com a posição aberta: o mesmo número do Profit.${parcial ? PARCIAL : ""}`,
  fechamento:
    "O ponto mais alto que o saldo do dia alcançou, conferido a cada operação fechada. A posição ainda aberta não entra na conta, por isso nunca passa do MEP da plataforma Profit, que acompanha o saldo a cada movimento do preço.",
};
const TEXTO_MEN = {
  ea: (parcial: boolean) =>
    `O ponto mais baixo que o saldo do dia alcançou, já com custos, medido no MetaTrader 5 a cada movimento do preço, com a posição aberta: o quanto o dia chegou a ficar no prejuízo.${parcial ? PARCIAL : ""}`,
  fechamento:
    "O ponto mais baixo que o saldo do dia alcançou, conferido a cada operação fechada: o quanto o dia chegou a ficar no prejuízo. A posição ainda aberta não entra na conta, por isso nunca passa do MEN da plataforma Profit, que acompanha o saldo a cada movimento do preço.",
};

/** Quando o extremo medido foi batido: a hora, ou, sem ela, depois de quantas operações fechadas. */
function quandoBateu(em: string | null, nSaidas: number): string {
  if (em) return `às ${formatarHora(em)}`;
  return nSaidas === 0 ? "antes da 1ª operação fechar" : `depois da ${formatarNumero(nSaidas)}ª operação`;
}

/** Um rótulo sim, um (ou mais) não, até caberem MAX_ROTULOS: de hora em hora, um pregão inteiro dá dez. */
function rarear<T>(rotulos: T[]): T[] {
  const passo = Math.ceil(rotulos.length / MAX_ROTULOS);
  return passo <= 1 ? rotulos : rotulos.filter((_, i) => i % passo === 0);
}

const fmtDiaLongo = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** "Terça-feira, 24 de novembro": o ano está no título do mês, logo acima. */
function tituloDoDia(dia: string): string {
  const texto = fmtDiaLongo.format(new Date(`${dia}T12:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// A curva do dia tem altura fixa (25/11/2026, ficha Mesa). De 19/09/2026 até aqui ela ia de 130 a 300 px,
// medida por um ResizeObserver, para o cartão do detalhe terminar junto com o cartão do calendário; sem
// caixa não há borda para alinhar, e a medição saiu.
const ALTURA_CURVA = 180;
// A régua da direita traz a unidade junto ("R$ 500"), porque desde a ficha Mesa o eixo não tem título; os
// centavos só aparecem quando a marca os tem (dia de poucos reais). De 24/09 a 25/11/2026 era "500,00", como
// a régua do Profit.
const eixoEmReais = (v: number) => formatarBRL(v, { inteiro: Number.isInteger(v) });
// o valor da maior queda do dia, escrito ao lado do trecho vermelho da curva
const quedaEmReais = (v: number) => formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 100 });
// no máximo estes rótulos de hora debaixo da curva: ao lado do mês ela tem uns 300 px
const MAX_ROTULOS = 6;

/**
 * O dia escolhido no calendário (ficha Mesa, 25/11/2026): a data, o resultado, quantas operações, o melhor e
 * o pior momento do dia e a curva do saldo. Fica ao lado do mês no computador e embaixo dele no celular. Sem
 * caixa: repete, menor, o desenho do lado do mês (linha de título, número, fatos).
 *
 * Revisão de 25/11/2026 (DESIGN.md, seção 9): saiu o "N com ganho" de debaixo do resultado. Acertos não
 * aparecem sem o necessário para empatar, e num dia só essa conta não diz nada; o resultado do dia e o pior
 * momento já contam como o dia foi.
 *
 * O que mudou do "Detalhe do dia" anterior, com os mesmos números das mesmas funções:
 * - eram três fileiras de números centralizados (resultado, operações e acerto; MEP e MEN) dentro de um
 *   cartão; agora o resultado é o número do bloco, as operações vão em palavras debaixo dele ("em 12
 *   operações") e o MEP e o MEN viraram "Melhor momento" e "Pior momento", em lista. Quem conhece o Profit
 *   acha a sigla na explicação do rótulo;
 * - "Por hora de entrada" saiu: repetia, em barras, o que a curva do dia mostra no eixo do tempo.
 *
 * A curva (23/09/2026): a série do saldo medida pelo EA quando o dia a tem (a faixa, as bolinhas de fechamento
 * e os marcadores de MEP/MEN saíram do desenho em 24/09/2026); senão, e enquanto ela carrega, a curva por
 * fechamento de sempre, rotulada assim, com os dentes de MFE/MAE das operações medidas. O desenho é o de
 * graficos/CurvaProfit, o mesmo do "Hoje" da visão geral: desde a ficha Mesa, uma linha na cor do texto com
 * a maior queda do dia em vermelho, sem moldura.
 */
export function DiaEscolhido({
  dia,
  ops,
  opcoes,
  exposicao,
  custoPorContrato,
  valorPonto,
  horario,
  saldo,
  carregando,
  aoTentarDeNovo,
  slug,
  nomeRobo,
  contaDemo,
  ref,
  className,
}: Props) {
  const idBase = useId().replace(/[^a-zA-Z0-9]/g, "");
  const idTitulo = `dia-${idBase}`;
  const idCurva = `cal-${idBase}`;

  const total = ops.reduce((s, op) => s + valorOperacao(op, opcoes), 0);

  // o dia em curva, operação a operação (as operações compactas já vêm em ordem de fechamento); desde
  // 23/09/2026 é a reserva: vale nos dias sem a série do saldo medida pelo EA, e enquanto ela carrega
  const curvaDoDia = useMemo(() => seriePorOperacao(ops, opcoes, [dia]), [ops, opcoes, dia]);

  // A série pronta para o desenho: bruta na rota, líquida aqui (o custo de cada operação fechada até o fim
  // do balde), reduzida a PONTOS_LEVE grupos, com o eixo do tempo pelos dados do dia (sem faixa, bolinhas de
  // fechamento nem marcadores MEP/MEN desde 24/09/2026, ver CurvaDoDia)
  const serieDoDia = useMemo(() => {
    if (typeof saldo !== "object" || saldo.baldes.length === 0) return null;
    const { fechamentos, bucketSeg, aproximado } = saldo;
    // só os baldes do pregão: o eixo não estica até a meia-noite; legenda curta
    // (24/09/2026, ver baldesDoPregao em series-da-curva)
    const baldes = baldesDoPregao(saldo.baldes, dia, horario, fechamentos);
    const liquida = liquidarSerie(baldes, fechamentos, bucketSeg, { base: opcoes.base, unidade: opcoes.unidade, valorPonto });
    // eixo pelos dados e linha limpa, como no Hoje ao vivo (24/09/2026, "estilo do profit"; ver CurvaDoDia)
    const janela = janelaDosDados(baldes, fechamentos, bucketSeg);
    // "desde HH:MM" quando o primeiro balde vem depois de uma saída, ou bem depois do início do eixo com o EA
    // marcando o dia como parcial (24/09/2026)
    const medidoDesdeT = inicioDaMedicao(liquida, fechamentos, janela.inicio, exposicao?.excursao_ea_parcial === true);
    return {
      pontos: serieDoSaldoParaDesenho(reduzirBaldes(liquida, PONTOS_LEVE), { janela, unidade: opcoes.unidade, bucketSeg, comFaixa: false }),
      rotulosX: rarear(rotulosDeTempo(janela)),
      // A linha debaixo da curva só aparece quando há ressalva a fazer: a série é aproximada, ou começou com o
      // dia em andamento (25/11/2026). Dia medido inteiro não leva legenda: "a cada 5 s" está na explicação do
      // título, e o "1 contrato, líquido" que a fechava é a premissa escrita debaixo do número do mês
      legenda: aproximado || medidoDesdeT !== null ? `saldo medido ${legendaCurtaDoSaldo({ bucketSeg, aproximado, medidoDesdeT })}` : undefined,
    };
  }, [dia, saldo, opcoes, valorPonto, horario, exposicao]);

  // Melhor e pior momento do dia (MEP e MEN), duas fontes (22/09/2026). Primeiro a medição do EA 1.1.0: tick a
  // tick, com a posição aberta, o número do Profit, trazido em R$ brutos e posto aqui na base e unidade da
  // curva (líquido: o custo de cada saída feita até o extremo). Sem medição (antes do EA 1.1.0, histórico
  // importado, EA antigo), o cálculo por fechamento sobre TODAS as operações (a curva desenhada é fatiada em
  // até 240 pontos e pode não passar pelo pico)
  const medido = useMemo(
    () => mepMenDoDia(exposicao, custoPorContrato, valorPonto, opcoes.base, opcoes.unidade),
    [exposicao, custoPorContrato, valorPonto, opcoes],
  );
  const excursao = useMemo(() => excursaoDoDia(ops, opcoes), [ops, opcoes]);
  const momentos =
    medido !== null
      ? {
          melhor: medido.mep > 0 ? { valor: medido.mep, quando: quandoBateu(medido.mepEm, medido.mepNSaidas) } : null,
          pior: medido.men < 0 ? { valor: medido.men, quando: quandoBateu(medido.menEm, medido.menNSaidas) } : null,
        }
      : ops.length > 0
        ? {
            melhor: excursao.operacaoMep !== null ? { valor: excursao.mep, quando: `na ${formatarNumero(excursao.operacaoMep)}ª operação` } : null,
            pior: excursao.operacaoMen !== null ? { valor: excursao.men, quando: `na ${formatarNumero(excursao.operacaoMen)}ª operação` } : null,
          }
        : null;

  // O eixo de baixo da curva por fechamento é a ordem de fechamento, e é isso que ele diz: "1ª", "31ª"... A
  // única hora que a operação compacta guarda é a de ABERTURA, e rotular por ela engana: em 02/09/2026 as
  // posições abertas às 10h só fecharam no fim do dia, e o eixo saía "9h 11h 13h 10h".
  const ordemNoEixo = useMemo(() => {
    const n = ops.length;
    const quantas = Math.min(5, n);
    const marcas = Array.from({ length: quantas }, (_, i) => {
      const f = i / quantas;
      return { x: f * 100, rotulo: `${formatarNumero(Math.min(n, Math.floor(f * n) + 1))}ª` };
    });
    return marcas.filter((m, i) => i === 0 || m.rotulo !== marcas[i - 1].rotulo);
  }, [ops]);

  return (
    <section ref={ref} aria-labelledby={idTitulo} className={cn("painel", className)}>
      {/* a mesma linha de título do mês, do outro lado: o nome do dia e, à direita, o compartilhar */}
      <header className="flex min-h-7 flex-wrap items-center justify-between gap-x-8 gap-y-2">
        <h3 id={idTitulo} className="text-[0.9375rem] font-medium">
          {tituloDoDia(dia)}
        </h3>
        {/* a imagem do dia escolhido para compartilhar (24/09/2026), só com operação: sem ela a rota responde
            404. A versão é o nº de operações: dia passado não muda, e o de hoje a CDN guarda 60 s */}
        {ops.length > 0 ? (
          <CompartilharDia
            slug={slug}
            nomeRobo={nomeRobo}
            dia={dia}
            versao={versaoDoCard(ops.length)}
            temOperacao
            rotulo="Compartilhar"
            className="shrink-0"
            contaDemo={contaDemo}
          />
        ) : null}
      </header>

      {/* Ao lado do mês (1280 px ou mais) e no celular, uma coluna: os números e, embaixo, a curva. No meio
          do caminho o bloco ocupa a largura toda debaixo do mês, e os números vão ao lado da curva em vez de
          deixar meia tela vazia */}
      <div className="mt-3 grid gap-x-12 gap-y-5 md:max-xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          {ops.length > 0 ? (
            <>
              <p className="text-[2rem] leading-none font-medium tracking-[-0.02em]">
                <Valor valor={total} inteiro={Math.abs(total) >= 1000} />
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                em {formatarNumero(ops.length)} {ops.length === 1 ? "operação" : "operações"}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma operação registrada neste dia.</p>
          )}

          {/* O melhor e o pior momento: o pico e o vale do saldo do dia (MEP e MEN). 22/09/2026: quando o EA
              1.1.0 mediu o dia, é o número do Profit (a cada movimento do preço, com a posição aberta); senão, o
              cálculo por fechamento. A linha de baixo diz qual dos dois a pessoa está lendo, porque muda de um
              dia para o outro (19/09/2026: tinha ido para dentro do "o que é"; voltou em 22/09 por isso) */}
          {momentos ? (
            <>
              <dl className="mt-4 text-sm">
                <div className="flex items-baseline justify-between gap-4 leading-7">
                  <dt className="text-muted-foreground">
                    <RotuloComInfo chave="mep" texto={medido ? TEXTO_MEP.ea(medido.parcial) : TEXTO_MEP.fechamento}>
                      Melhor momento
                    </RotuloComInfo>
                  </dt>
                  <dd className="min-w-0 text-right">
                    {momentos.melhor ? (
                      <>
                        <span className="mr-3 text-sutil">{momentos.melhor.quando}</span>
                        <Valor valor={momentos.melhor.valor} inteiro={Math.abs(momentos.melhor.valor) >= 1000} className="font-medium" />
                      </>
                    ) : (
                      <span className="text-sutil">não ficou positivo</span>
                    )}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 leading-7">
                  <dt className="text-muted-foreground">
                    <RotuloComInfo chave="men" texto={medido ? TEXTO_MEN.ea(medido.parcial) : TEXTO_MEN.fechamento}>
                      Pior momento
                    </RotuloComInfo>
                  </dt>
                  <dd className="min-w-0 text-right">
                    {momentos.pior ? (
                      <>
                        <span className="mr-3 text-sutil">{momentos.pior.quando}</span>
                        <Valor valor={momentos.pior.valor} inteiro={Math.abs(momentos.pior.valor) >= 1000} className="font-medium" />
                      </>
                    ) : (
                      <span className="text-sutil">não ficou negativo</span>
                    )}
                  </dd>
                </div>
              </dl>
              <p className="mt-1.5 text-[0.8125rem] text-pretty text-sutil">
                {medido
                  ? `medido no MetaTrader 5 a cada movimento do preço, com a posição aberta${medido.parcial ? " · parcial: a medição começou com o dia em andamento" : ""}`
                  : "conferido a cada operação fechada, sem contar a posição aberta"}
              </p>
            </>
          ) : null}
        </div>

        <div className="min-w-0">
          {/* a legenda da moldura é aria-hidden: o aviso de carga (e o de falha) vai também numa região de status, só para leitor de tela */}
          <span role="status" className="sr-only">
            {carregando && curvaDoDia.length > 0 ? "Carregando o saldo medido do dia." : saldo === "erro" ? "O saldo medido do dia não carregou." : ""}
          </span>
          {serieDoDia !== null ? (
            <MolduraProfit
              // o "o que é" vai no título, que é lido; a legenda é aria-hidden (19/09/2026)
              titulo={<RotuloComInfo chave="curvaDoDia">O saldo ao longo do dia</RotuloComInfo>}
              legenda={serieDoDia.legenda}
            >
              {/* a linha nasce no primeiro balde, não no zero da abertura: o coletor que subiu no meio do dia
                  não pode virar uma rampa que nunca aconteceu (revisão de 23/09/2026) */}
              <DesenhoDaCurva
                key={dia}
                id={idCurva}
                pontos={serieDoDia.pontos}
                cores={CURVA_POR_OPERACAO}
                altura={ALTURA_CURVA}
                comecarNoPrimeiroPonto
                rotulosX={serieDoDia.rotulosX}
                formatarEixo={eixoEmReais}
                formatarQueda={quedaEmReais}
                rotuloAria={`Saldo de ${formatarData(dia)} medido no MetaTrader 5 ao longo do pregão`}
              />
            </MolduraProfit>
          ) : curvaDoDia.length > 0 ? (
            <MolduraProfit
              titulo={<RotuloComInfo chave="curvaDoDia">O saldo do dia, operação a operação</RotuloComInfo>}
              legenda={`na ordem em que as operações fecharam${carregando ? " · carregando o saldo medido…" : ""}`}
            >
              <DesenhoDaCurva
                key={dia}
                id={idCurva}
                pontos={curvaDoDia}
                cores={CURVA_POR_OPERACAO}
                altura={ALTURA_CURVA}
                rotulosX={ordemNoEixo}
                formatarEixo={eixoEmReais}
                formatarQueda={quedaEmReais}
                rotuloAria={`Resultado acumulado de ${formatarData(dia)}, operação a operação`}
              />
            </MolduraProfit>
          ) : null}
          {/* A rota falhou (rede, 503 do banco): o aviso e o "Tentar de novo" ficam FORA da legenda, que é
              aria-hidden (revisão de 23/09/2026: um botão dentro de aria-hidden chega pelo Tab e não é anunciado,
              e para quem enxerga o erro não tinha nome). Desde 25/11/2026 é uma linha de texto debaixo da curva,
              com o botão em texto com fio; era uma pílula no rodapé da moldura */}
          {saldo === "erro" ? (
            <p className="mt-2 text-[0.8125rem] text-sutil">
              O saldo medido deste dia não carregou.{" "}
              <button type="button" onClick={() => aoTentarDeNovo(dia)} className={LINK_DO_PAINEL}>
                Tentar de novo
              </button>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
