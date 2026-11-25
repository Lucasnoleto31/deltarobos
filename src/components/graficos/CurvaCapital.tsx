"use client";

import { cn } from "cn";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import { LINK_DO_PAINEL } from "@/components/sistema/Painel";
import { formatarBRL, formatarNumero, formatarPontos } from "@/lib/formato";
import type { OperacaoCompacta } from "@/lib/stats/operacoes";
import { drawdownMaximo } from "@/lib/stats/serie";
import { maiorQueda } from "@/lib/stats/serie-casa";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";
import { CURVA_POR_DIA, CURVA_POR_OPERACAO, DesenhoDaCurva, MolduraProfit, type PontoDoDesenho } from "./CurvaProfit";
import { extremosPorOperacao, rotulosDeData, seriePorDia, seriePorOperacao } from "./series-da-curva";

interface Props {
  /** série já filtrada pelo período desejado */
  linhas: readonly LinhaDiaria[];
  opcoes: OpcoesSerie;
  /** altura da curva em px (padrão 320); com `quedasEmbaixo`, a altura do conjunto, dividida entre a curva e as quedas */
  altura?: number;
  /** escreve, na linha acima da curva, o resultado do período, a maior queda e quantos pregões (padrão sim) */
  mostrarResumo?: boolean;
  /** operações do mesmo período: liga a opção "Por operação" (a série é montada aqui, quando ela é escolhida) */
  operacoes?: readonly OperacaoCompacta[];
  /** a série por operação já montada (a visão geral monta no servidor e manda só os pontos da leve) */
  pontosPorOperacao?: PontoDoDesenho[];
  /**
   * Busca a série por operação completa (uma operação por ponto) quando "Por operação" é escolhida:
   * `pontosPorOperacao` é a leve, que pinta na hora e fica até a completa chegar. Uma chamada por
   * carregador, guardada nesta instância (alternar as opções não pede de novo). Null deixa a leve de
   * vez; erro (promessa rejeitada) deixa a leve e a próxima escolha de "Por operação" tenta de novo. O
   * sinal cancela o pedido quando a instância desmonta. Quem troca de período troca o carregador.
   */
  carregarPorOperacao?: (sinal: AbortSignal) => Promise<PontoDoDesenho[] | null>;
  /**
   * Valores que entram na régua vertical além dos pontos desenhados: os extremos da série completa
   * (SerieCompacta.extremos), para a leve e a fiel dividirem a mesma escala. Com `operacoes`, os
   * extremos saem delas aqui mesmo.
   */
  escalaExtra?: readonly number[];
  /** com que agrupamento abre (padrão: por dia) */
  modoInicial?: Modo;
  /**
   * Desenha, embaixo da curva, o quanto ela ficou abaixo do topo em cada ponto (era o padrão até 25/11/2026).
   * Desligado por padrão desde a ficha Mesa: a maior queda já vem em vermelho na própria linha, a leitura de
   * cada ponto diz a distância do topo, e o gráfico inteiro das quedas mora na aba Quedas e risco.
   */
  quedasEmbaixo?: boolean;
}

type Modo = "operacao" | "dia";
type Carregador = NonNullable<Props["carregarPorOperacao"]>;
const MODOS: ReadonlyArray<{ valor: Modo; rotulo: string }> = [
  { valor: "dia", rotulo: "Por dia" },
  { valor: "operacao", rotulo: "Por operação" },
];

/**
 * "5,77 mil" a partir de mil, no padrão brasileiro, sem a moeda. O simulador usa a mesma para o eixo do
 * patrimônio. O eixo desta curva usa `noEixo`, que traz a unidade junto.
 */
export function escalaEmReais(v: number): string {
  return Math.abs(v) >= 1000
    ? `${formatarNumero(v / 1000, Math.abs(v) % 1000 === 0 ? 0 : 1)} mil`
    : formatarNumero(v || 0, 0);
}

/** "R$ 40 mil", "−R$ 2,5 mil", "R$ 500": o eixo de valores não tem título, então a unidade vem em cada marca, como no GraficoResultado. */
function noEixo(v: number): string {
  if (v === 0) return "R$ 0";
  const sinal = v < 0 ? "−" : "";
  const a = Math.abs(v);
  return a >= 1000 ? `${sinal}R$ ${formatarNumero(a / 1000, a % 1000 === 0 ? 0 : 1)} mil` : `${sinal}${formatarBRL(a, { inteiro: true })}`;
}

/**
 * Curva do resultado acumulado, por dia ou por operação. Desde a ficha Mesa (25/11/2026) é o mesmo desenho do
 * resto do sistema: a linha direto sobre o fundo, na cor do texto, com a maior queda em vermelho e o valor
 * escrito ao lado; o agrupamento num seletor em texto ("Por dia", "Por operação") alinhado à borda direita do
 * gráfico, no lugar das abas do rodapé; e nenhuma caixa em volta. De 17/09 a 25/11/2026 imitava o Gráfico de
 * Patrimônio do Profit (moldura grafite, verde e vermelho próprios, drawdown em barras embaixo).
 *
 * Os dois agrupamentos dividem a mesma escala e o mesmo eixo de tempo, então a troca só acrescenta ou tira o
 * sobe e desce de dentro do dia. Quem controla período, unidade e base é o pai. O resumo (opcional) continua
 * vindo de curvaAcumulada e drawdownMaximo, por dia; a premissa do número ("com 1 contrato, já descontados os
 * custos") é da tela, junto do número grande, e não se repete aqui.
 */
export function CurvaCapital({
  linhas,
  opcoes,
  altura = 320,
  mostrarResumo = true,
  operacoes,
  pontosPorOperacao,
  carregarPorOperacao,
  escalaExtra,
  modoInicial = "dia",
  quedasEmbaixo = false,
}: Props) {
  // abre por dia, como no Hub: a linha limpa é a do fechamento de cada pregão
  const [modo, setModo] = useState<Modo>(modoInicial);
  // A série montada das operações (aba Desempenho: até 20 mil pontos com a leitura escrita) só se monta
  // quando "Por operação" abre pela primeira vez (22/09/2026): antes era montada na hidratação e a cada
  // troca de filtro, mesmo com "Por dia" na tela, e pesava no celular. Uma vez aberta, fica montada:
  // alternar as opções não refaz.
  const [abriuPorOperacao, setAbriuPorOperacao] = useState(modoInicial === "operacao");
  const escolherModo = (m: Modo) => {
    setModo(m);
    if (m === "operacao") setAbriuPorOperacao(true);
  };

  // A série completa, pedida uma vez por carregador ao abrir "Por operação" (22/09/2026). A carga diz
  // de que carregador veio: carregador novo (outro período) é outra carga, e a anterior não vale.
  // `pontos` null é erro ou resposta vazia: fica a leve. "Carregando" não é estado: enquanto o modo é
  // por operação, há carregador e a carga dele não chegou, está carregando.
  const [carga, setCarga] = useState<{ carregador: Carregador; pontos: PontoDoDesenho[] | null } | null>(null);
  const pedido = useRef<Carregador | null>(null);
  const emVoo = useRef<AbortController | null>(null);
  const cargaAtual = carga !== null && carga.carregador === carregarPorOperacao ? carga : null;

  const porDia = useMemo(() => seriePorDia(linhas, opcoes), [linhas, opcoes]);
  const porOperacao = useMemo(() => {
    if (cargaAtual?.pontos) return cargaAtual.pontos;
    if (pontosPorOperacao) return pontosPorOperacao;
    return operacoes && abriuPorOperacao ? seriePorOperacao(operacoes, opcoes, porDia.dias) : null;
  }, [cargaAtual, pontosPorOperacao, operacoes, abriuPorOperacao, opcoes, porDia.dias]);
  // os extremos de todas as operações: a régua é a mesma antes e depois de a série por operação existir
  const extremos = useMemo(
    () => escalaExtra ?? (operacoes ? extremosPorOperacao(operacoes, opcoes) : []),
    [escalaExtra, operacoes, opcoes],
  );
  const dd = useMemo(() => drawdownMaximo(porDia.curva), [porDia.curva]);
  // A maior queda do período, dia a dia: é a dos indicadores da tela, e é ela que a curva pinta de vermelho nos
  // dois agrupamentos. O pregão k fica em (k + 1) / n na régua do eixo; o pico em 0 é a partida. Operação a
  // operação a queda dos pontos seria outra (mais funda, por dentro do dia), e a tela teria dois números
  const quedaDoPeriodo = useMemo(() => {
    const q = maiorQueda(porDia.curva);
    const n = porDia.curva.length;
    return q && q.valor > 0 ? { de: (q.iInicio + 1) / n, ate: (q.iFundo + 1) / n, valor: q.valor } : null;
  }, [porDia.curva]);

  // Zoom: um trecho do eixo, em frações; arrastar na curva escolhe, "Ver o período todo" desfaz. Só o desenho
  // muda (os pontos fora saem e os de dentro se espalham); o resumo em cima continua o do período.
  // o zoom vale só para a série em que foi feito: trocar período, unidade ou base volta a mostrar tudo
  const [zoomDaSerie, setZoomDaSerie] = useState<{ linhas: readonly LinhaDiaria[]; de: number; ate: number } | null>(null);
  const zoom = zoomDaSerie && zoomDaSerie.linhas === linhas ? zoomDaSerie : null;
  const setZoom = (z: { de: number; ate: number } | null | ((atual: { de: number; ate: number } | null) => { de: number; ate: number } | null)) => {
    const novo = typeof z === "function" ? z(zoom) : z;
    setZoomDaSerie(novo ? { linhas, ...novo } : null);
  };
  const recortar = (ps: PontoDoDesenho[]) =>
    zoom ? ps.filter((p) => p.posicao >= zoom.de && p.posicao <= zoom.ate).map((p) => ({ ...p, posicao: (p.posicao - zoom.de) / (zoom.ate - zoom.de) })) : ps;
  const pontosDia = useMemo(() => recortar(porDia.pontos), [porDia.pontos, zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  const pontosOperacao = useMemo(() => (porOperacao ? recortar(porOperacao) : null), [porOperacao, zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  const rotulosX = useMemo(() => {
    const dias = porDia.dias;
    if (!zoom) return rotulosDeData(dias);
    const de = Math.floor(zoom.de * dias.length);
    const ate = Math.max(de + 1, Math.ceil(zoom.ate * dias.length));
    return rotulosDeData(dias.slice(de, ate));
  }, [porDia.dias, zoom]);

  const curva = porDia.curva;
  const acumulado = curva.length > 0 ? curva[curva.length - 1].acumulado : 0;
  const unidade = opcoes.unidade;
  // o seletor existe quando há operações para a segunda opção, montada ou não
  const temAbas = (cargaAtual?.pontos?.length ?? pontosPorOperacao?.length ?? operacoes?.length ?? 0) > 0;
  const modoAtivo: Modo = temAbas ? modo : "dia";

  useEffect(() => {
    if (!carregarPorOperacao || modoAtivo !== "operacao" || pedido.current === carregarPorOperacao) return;
    pedido.current = carregarPorOperacao;
    emVoo.current?.abort();
    const controle = new AbortController();
    emVoo.current = controle;
    carregarPorOperacao(controle.signal).then(
      (pontos) => {
        // a resposta de um pedido cancelado, ou de um carregador que o pai já trocou, não vale mais
        if (controle.signal.aborted || pedido.current !== carregarPorOperacao) return;
        // até 20 mil pontos: em transição, para a mira e o clique não travarem enquanto o traçado é refeito
        startTransition(() => setCarga({ carregador: carregarPorOperacao, pontos: pontos && pontos.length > 0 ? pontos : null }));
      },
      () => {
        if (controle.signal.aborted || pedido.current !== carregarPorOperacao) return;
        // falhou (rede, 503 do banco): fica a leve, e a próxima escolha de "Por operação" pede de novo
        pedido.current = null;
        setCarga({ carregador: carregarPorOperacao, pontos: null });
      },
    );
  }, [carregarPorOperacao, modoAtivo]);
  // Desmontar (trocar de período troca a instância) cancela o pedido em voo: Semana, Mês, Ano, Tudo em
  // sequência não deixam quatro respostas de 700 KB chegando e expandindo em componentes mortos. Zerar
  // `pedido` é pelo StrictMode, que monta, desmonta e monta de novo: sem isso a segunda montagem acharia
  // o pedido já feito (e cancelado) e nunca pediria.
  useEffect(
    () => () => {
      emVoo.current?.abort();
      pedido.current = null;
    },
    [],
  );
  const carregando = modoAtivo === "operacao" && carregarPorOperacao !== undefined && cargaAtual === null;

  const pontos = modoAtivo === "dia" ? pontosDia : (pontosOperacao ?? []);
  // a série por operação traz os dentes de MFE/MAE quando as operações foram medidas pelo EA (23/09/2026):
  // a legenda só os explica quando existem, senão o histórico antigo, sem medição, ganharia uma linha à toa.
  // Os dentes viajam dentro de cada ponto, então o recorte do zoom os leva junto sem código a mais
  const temDentes = useMemo(() => modoAtivo === "operacao" && (pontosOperacao ?? []).some((p) => p.dente !== undefined), [modoAtivo, pontosOperacao]);
  // A escala cobre as duas séries e os extremos de todas as operações: trocar de agrupamento não muda a régua,
  // e a completa chega na régua da leve (com a completa são até 20 mil pontos: memo). No zoom só o trecho
  // conta, senão o trecho ampliado ficaria com a régua do todo. Os dentes de MFE/MAE da série por operação
  // entram aqui, e não só no desenho (revisão de 23/09/2026): o MAE costuma descer abaixo do menor acumulado,
  // e a régua mudava ao trocar de "Por dia" para "Por operação"; `extremos` já os traz para a série inteira
  const escalaDe = useMemo(() => {
    const valores = [...pontosDia.map((p) => p.acumulado), ...(zoom ? [] : extremos)];
    for (const p of pontosOperacao ?? []) {
      valores.push(p.acumulado);
      if (p.dente) valores.push(p.dente.de, p.dente.ate);
    }
    return valores;
  }, [pontosDia, pontosOperacao, extremos, zoom]);

  const alturaDaCurva = quedasEmbaixo ? Math.round(altura * 0.66) : altura;
  const alturaDoDrawdown = quedasEmbaixo ? Math.max(56, Math.round(altura * 0.26)) : 0;
  // referências estáveis: o desenho guarda o traçado (até 20 mil pontos) enquanto os props não mudam
  const formatarEixo = useCallback((v: number) => (unidade === "brl" ? noEixo(v) : `${formatarPontos(v || 0)} pts`), [unidade]);
  const formatarQueda = useCallback(
    (v: number) => (unidade === "brl" ? formatarBRL(v, { sinal: true, inteiro: true }) : `${formatarPontos(v, true)} pts`),
    [unidade],
  );

  const verTudo = (
    <button type="button" onClick={() => setZoom(null)} className={cn(LINK_DO_PAINEL, "outline-none focus-visible:ring-2 focus-visible:ring-ring/50")}>
      Ver o período todo
    </button>
  );

  return (
    <div className="min-w-0">
      {/* a legenda do desenho é aria-hidden: o aviso de carga vai também numa região de status, só para leitor de tela */}
      <span role="status" className="sr-only">
        {carregando ? "Carregando a curva operação a operação." : ""}
      </span>

      {pontos.length === 0 && zoom ? (
        <p className="py-16 text-sm text-muted-foreground">Nenhum ponto nesse trecho. {verTudo}</p>
      ) : curva.length === 0 ? (
        <p className="py-16 text-sm text-muted-foreground">Sem operações no período.</p>
      ) : (
        <MolduraProfit
          titulo={
            mostrarResumo ? (
              <dl className="flex flex-wrap gap-x-7 gap-y-1 text-sm text-foreground">
                <div className="flex items-baseline gap-2">
                  <dt className="text-muted-foreground">No período</dt>
                  <dd className="font-medium">
                    <Valor valor={acumulado} unidade={unidade} />
                  </dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt className="text-muted-foreground">Maior queda</dt>
                  <dd className="font-medium">
                    {dd.valor > 0 ? <Valor valor={-dd.valor} unidade={unidade} /> : <span className="font-normal text-sutil">nenhuma</span>}
                    {dd.diasAteRecuperar !== null ? (
                      <span className="ml-1.5 text-[0.8125rem] font-normal text-sutil">
                        recuperada em {formatarNumero(dd.diasAteRecuperar)} {dd.diasAteRecuperar === 1 ? "dia" : "dias"}
                      </span>
                    ) : dd.valor > 0 ? (
                      <span className="ml-1.5 text-[0.8125rem] font-normal text-sutil">ainda não recuperada</span>
                    ) : null}
                  </dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt className="text-muted-foreground">Pregões</dt>
                  <dd className="font-medium">{formatarNumero(curva.length)}</dd>
                </div>
              </dl>
            ) : undefined
          }
          // À direita, na borda do gráfico: desfazer o zoom (só com um trecho ampliado) e o agrupamento. Eram as
          // abas do rodapé da moldura e um botão em pílula dentro da legenda; viraram o seletor em texto do resto
          // do sistema (Segmentado) e um link com fio (ficha Mesa, 25/11/2026)
          abas={
            zoom || temAbas ? (
              <>
                {zoom ? verTudo : null}
                {temAbas ? <Segmentado ariaLabel="Agrupar a curva" opcoes={MODOS} valor={modoAtivo} onChange={escolherModo} /> : null}
              </>
            ) : undefined
          }
          // legenda só para o que o desenho não explica sozinho: a leve (um ponto por fatia de operações) fica na
          // tela enquanto a completa vem, só com o aviso, sem spinner; e os traços verticais do MFE/MAE
          legenda={
            carregando || temDentes ? (
              <>
                {carregando ? <span>carregando operação a operação…</span> : null}
                {temDentes ? <span>Os traços verticais vão do pior ao melhor momento de cada operação.</span> : null}
              </>
            ) : undefined
          }
        >
          {/* sem key de propósito: o desenho guarda a fração do ponteiro, não o índice, então a completa no lugar da
              leve, a troca de agrupamento e o zoom trocam a lista sem remontar; a mira e um arrasto em andamento não
              se perdem. No trecho ampliado a linha nasce no primeiro ponto do trecho, e não no zero da borda */}
          <DesenhoDaCurva
            pontos={pontos}
            aoSelecionar={(de, ate) => setZoom((z) => (z ? { de: z.de + de * (z.ate - z.de), ate: z.de + ate * (z.ate - z.de) } : { de, ate }))}
            escalaDe={escalaDe}
            cores={modoAtivo === "dia" ? CURVA_POR_DIA : CURVA_POR_OPERACAO}
            altura={alturaDaCurva}
            alturaDoDrawdown={alturaDoDrawdown}
            rotulosX={rotulosX}
            formatarEixo={formatarEixo}
            comecarNoPrimeiroPonto={zoom !== null}
            formatarQueda={formatarQueda}
            // Sem zoom, o trecho vermelho e o número são os da maior queda do período (os dos indicadores da tela),
            // nos dois agrupamentos. No trecho ampliado o desenho procura a maior queda do que está à vista, e o
            // rótulo diz que é a do trecho
            trechoDaQueda={zoom ? undefined : quedaDoPeriodo}
            valorDaQueda={zoom ? undefined : quedaDoPeriodo?.valor}
            rotuloDaQueda={zoom ? "maior queda do trecho" : undefined}
            rotuloAria={`Resultado acumulado ${modoAtivo === "dia" ? "dia a dia" : "operação a operação"}, com a maior queda em vermelho${
              quedasEmbaixo ? " e, embaixo, o quanto ficou abaixo do ponto mais alto" : ""
            }`}
          />
        </MolduraProfit>
      )}
    </div>
  );
}
