"use client";

import { memo, useId, useMemo } from "react";
import { tomDe, type ConteudoDaDica } from "@/components/graficos/base";
import {
  AmostraDaLinha,
  CURVA_POR_OPERACAO,
  DesenhoDaCurva,
  MolduraProfit,
  type MarcadorDaCurva,
  type PontoDoDesenho,
} from "@/components/graficos/CurvaProfit";
import { PONTOS_LEVE, baldesDoPregao, espacarFechamentos, fatiar, legendaCurtaDoSaldo, marcadoresDoSaldo, serieDoSaldoParaDesenho } from "@/components/graficos/series-da-curva";
import { formatarBRL, formatarDuracao, formatarHora, formatarMfeMae, formatarNumero, formatarPontos, formatarPreco, rotuloLado } from "@/lib/formato";
import type { HorarioPregao } from "@/lib/stats/pregao";
import {
  PONTOS_SALDO,
  dentesPorOperacao,
  envelopeDeDentes,
  fechamentosDasOperacoes,
  fechamentosNaCurva,
  inicioDaMedicao,
  janelaDoDia,
  liquidarSerie,
  reduzirBaldes,
  rotulosDeHora,
  type SaldoHoje,
} from "@/lib/stats/saldo-dia";
import type { OperacaoPublica } from "@/lib/tipos";

interface Props {
  /** operações fechadas hoje, em ordem de fechamento */
  operacoes: readonly OperacaoPublica[];
  /**
   * A série do saldo de hoje medida pelo EA 1.1.2 (estado.saldoHoje, 23/09/2026). Modo "serie" quando
   * `saldo.carregado` e há balde, com `dia` e `horario`; senão modo "fechamento", a curva de sempre.
   */
  saldo?: SaldoHoje | null;
  /** o dia de pregão (YYYY-MM-DD) e o horário que dimensionam o eixo do tempo no modo série */
  dia?: string;
  horario?: HorarioPregao;
  /** R$ por ponto do ativo: com ele o MFE/MAE de cada operação vira dente no modo por fechamento; sem ele, sem dentes */
  valorPonto?: number;
  altura?: number;
  /** título no modo por fechamento */
  titulo?: string;
  /** título no modo série */
  tituloSerie?: string;
  /**
   * Texto ao lado da amostra da linha (a tela ao vivo usa um mais curto, que fica bem em print). Só no modo
   * por fechamento, como `${legenda} · por fechamento`; no modo série a legenda é a curta da medição (legendaCurtaDoSaldo)
   * mais " · líquido" (revisão de 23/09/2026: anexar o texto inteiro dava três linhas a 375 px na tela cheia, e
   * "por contrato, líquido de custos" já está escrito debaixo do número grande nas duas telas).
   */
  legenda?: string;
  /** MEP/MEN do dia medidos pelo EA (22/09/2026), na régua da curva por fechamento; quem passa memoiza, por causa do memo daqui */
  marcadores?: ReadonlyArray<MarcadorDaCurva>;
  /**
   * O EA marcou o dia como parcial (excursao_ea_parcial: subiu com o dia em andamento). Só aí a legenda diz "desde HH:MM"
   * quando a série começa depois do início do horário (24/09/2026: sem isso, todo dia dizia "desde" a 1ª entrada).
   */
  coletorAtrasado?: boolean;
}

const reais = (v: number) => formatarBRL(v, { sinal: true });
const eixoEmReais = (v: number) => formatarNumero(v, 0);
const SEM_ROTULOS: Array<{ x: number; rotulo: string }> = [];

/**
 * O dia em curva, operação a operação, no lugar do tabelão (17/09/2026, pedido do Artur: "essa visão
 * geral com esse tabelão não está legal"). Num dia de 345 operações a tabela não deixava ver o dia;
 * a curva mostra de relance quando subiu, quando devolveu e onde está agora, e apontar um ponto abre a
 * operação inteira na linha de leitura no alto: hora, lado, entrada e saída, duração, pontos,
 * resultado e o acumulado.
 * Com memo (18/09/2026): quem usa re-renderiza por outros motivos (posição, status); a curva só
 * refaz quando chega operação nova, que troca a referência de `operacoes`.
 *
 * 23/09/2026 (Lucas: "quero ver de fato o que o robô passou de 'calor' até pagar, quero que mostre a
 * real curva dele"): quando o EA 1.1.2 mediu o dia, a curva passa a ser a SÉRIE DO SALDO (realizado +
 * flutuante a cada 5 s, líquida dos custos das operações já fechadas), com a faixa mín./máx. de cada
 * balde, os fechamentos marcados na linha e o MEP/MEN da própria série; o eixo é o horário do robô, e a
 * curva cresce da esquerda para a direita como um gráfico intradiário. Sem série (EA anterior, robô sem
 * coletor, rota ainda não respondeu) fica a curva por fechamento, rotulada assim, agora com o dente de
 * MFE/MAE de cada operação medida.
 */
export const CurvaDoDia = memo(function CurvaDoDia({
  operacoes,
  saldo,
  dia,
  horario,
  valorPonto,
  altura = 190,
  titulo = "Resultado do dia, operação a operação",
  tituloSerie = "Resultado do dia, medido no MT5",
  legenda = "1 contrato, líquido de custos",
  marcadores,
  coletorAtrasado = false,
}: Props) {
  const id = `dia-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  // Modo série: a foto da rota já chegou (carregado) e trouxe balde. Eventos anteriores à carga ficam
  // guardados mas não bastam: sem a foto a série teria só os últimos 30 s do dia.
  const modoSerie = !!(saldo && saldo.carregado && saldo.baldes.length > 0 && dia && horario);

  const serie = useMemo(() => {
    if (!saldo || !saldo.carregado || saldo.baldes.length === 0 || !dia || !horario) return null;
    const { bucketSeg, aproximado } = saldo;
    // o líquido no instante t desconta o custo das operações fechadas até ali: as operações do dia que a
    // tela já tem ao vivo (o mesmo que mepMenDoDia faz com n_saidas × custo, aqui com o custo de cada uma)
    const fechamentos = fechamentosDasOperacoes(operacoes);
    // só os baldes do pregão: o eixo não estica até a meia-noite (24/09/2026, ver baldesDoPregao)
    const baldes = baldesDoPregao(saldo.baldes, dia, horario, fechamentos);
    const janela = janelaDoDia(dia, horario, baldes, bucketSeg, fechamentos);
    const liquida = liquidarSerie(baldes, fechamentos, bucketSeg, { base: "liquido", unidade: "brl", valorPonto: valorPonto ?? 1 });
    const pontos = serieDoSaldoParaDesenho(reduzirBaldes(liquida, PONTOS_SALDO), { janela, unidade: "brl", bucketSeg, comFaixa: !aproximado });
    const medidoDesdeT = inicioDaMedicao(liquida, fechamentos, janela.inicio, coletorAtrasado);
    return {
      pontos,
      // o MEP/MEN da própria série: o pico e o vale dos baldes, que batem com exposicao_dia
      marcadores: marcadoresDoSaldo(liquida, janela),
      fechamentos: espacarFechamentos(fechamentosNaCurva(fechamentos, liquida, janela)),
      rotulosX: rotulosDeHora(janela),
      legenda: legendaCurtaDoSaldo({ bucketSeg, aproximado, medidoDesdeT }),
    };
  }, [saldo, operacoes, dia, horario, valorPonto, coletorAtrasado]);

  const porFechamento = useMemo(() => {
    // com a série na tela a curva por fechamento não é montada: seria trabalho jogado fora a cada balde
    if (modoSerie) return { pontos: [] as PontoDoDesenho[], rotulosX: SEM_ROTULOS };
    const n = operacoes.length;
    let acumulado = 0;
    let pico = 0;
    const brutos = operacoes.map((o, i) => {
      const liquido = o.resultado_brl_por_contrato - o.custos_brl_por_contrato;
      acumulado += liquido;
      pico = Math.max(pico, acumulado);
      return { o, indice: i, ordem: i + 1, liquido, acumulado, drawdown: Math.min(0, acumulado - pico), posicao: (i + 1) / n };
    });
    // Os dentes de MFE/MAE (23/09/2026): do acumulado antes da operação mais o MAE até o acumulado antes
    // mais o MFE, em R$ pelo valor do ponto. Só com o valor do ponto; operação sem medição fica sem dente.
    const dentes =
      valorPonto !== undefined
        ? dentesPorOperacao(
            brutos.map((b) => ({ valor: b.liquido, mfe: b.o.mfe_pontos_por_contrato ?? null, mae: b.o.mae_pontos_por_contrato ?? null })),
            { unidade: "brl", valorPonto },
          )
        : null;

    // o mesmo teto e a mesma divisão da curva de capital (22/09/2026: a cópia local da fórmula perdia a última
    // operação num dia de 245, 490, 505... operações, e o acumulado do fim da curva não batia com o do dia)
    const fatias = fatiar(brutos, PONTOS_LEVE);

    const pontosDoDia = fatias.map((fatia): PontoDoDesenho => {
      const primeiro = fatia[0];
      const ultimo = fatia[fatia.length - 1];
      const drawdown = fatia.reduce((m, b) => Math.min(m, b.drawdown), 0);
      let dica: ConteudoDaDica;
      let dente: PontoDoDesenho["dente"];
      if (fatia.length === 1) {
        const { o } = ultimo;
        const temPrecos = o.preco_entrada !== null && o.preco_saida !== null;
        dente = dentes?.[ultimo.indice] ?? undefined;
        dica = {
          titulo: `${formatarHora(o.fechamento_em)} · ${rotuloLado(o.lado)}`,
          subtitulo: `${formatarNumero(ultimo.ordem)}ª operação · durou ${formatarDuracao(o.duracao_seg)}`,
          linhas: [
            ...(temPrecos
              ? [{ rotulo: "Entrada e saída", valor: `${formatarPreco(o.preco_entrada)} → ${formatarPreco(o.preco_saida)}` }]
              : []),
            { rotulo: "Pontos", valor: `${formatarPontos(o.pontos_por_contrato, true)} pts`, tom: tomDe(o.pontos_por_contrato) },
            // o calor da operação, em pontos, logo depois dos pontos que ela fez
            ...(dente ? [{ rotulo: "MFE / MAE", valor: formatarMfeMae(dente.mfe, dente.mae) }] : []),
            { rotulo: "Resultado", valor: reais(ultimo.liquido), tom: tomDe(ultimo.liquido) },
            { rotulo: "Acumulado do dia", valor: reais(ultimo.acumulado), tom: tomDe(ultimo.acumulado) },
          ],
        };
      } else {
        const valor = fatia.reduce((s, b) => s + b.liquido, 0);
        // a fatia leva o envelope dos dentes dela: o pior MAE e o melhor MFE das operações que junta
        dente = dentes ? (envelopeDeDentes(dentes.slice(primeiro.indice, ultimo.indice + 1)) ?? undefined) : undefined;
        // 19/09/2026: o ponto diz quantas operações junta e quais; "Neste trecho" não se entendia
        dica = {
          titulo: `${formatarHora(primeiro.o.fechamento_em)} a ${formatarHora(ultimo.o.fechamento_em)}`,
          subtitulo: `${formatarNumero(fatia.length)} operações (${formatarNumero(primeiro.ordem)}ª a ${formatarNumero(ultimo.ordem)}ª)`,
          linhas: [
            { rotulo: "Resultado", valor: reais(valor), tom: tomDe(valor) },
            { rotulo: "Acumulado do dia", valor: reais(ultimo.acumulado), tom: tomDe(ultimo.acumulado) },
            ...(dente ? [{ rotulo: "MFE / MAE (extremos)", valor: formatarMfeMae(dente.mfe, dente.mae) }] : []),
          ],
        };
      }
      // na mira, o eixo de baixo diz a hora de fechamento, como os rótulos dele
      return { posicao: ultimo.posicao, acumulado: ultimo.acumulado, drawdown, dica, eixo: formatarHora(ultimo.o.fechamento_em), ...(dente ? { dente } : {}) };
    });

    // cinco horários espaçados por igual: a hora da operação que está naquela altura do eixo
    const marcas = n === 0 ? [] : Array.from({ length: Math.min(5, n) }, (_, i) => {
      const f = i / Math.min(5, n);
      return { x: f * 100, rotulo: formatarHora(operacoes[Math.min(n - 1, Math.floor(f * n))].fechamento_em) };
    });
    return { pontos: pontosDoDia, rotulosX: marcas.filter((m, i) => i === 0 || m.rotulo !== marcas[i - 1].rotulo) };
  }, [modoSerie, operacoes, valorPonto]);

  // com posição aberta e nenhuma saída a série já aparece (é o "calor" antes da primeira saída); nada só
  // quando não há nem série nem operação
  const pontos = serie ? serie.pontos : porFechamento.pontos;
  if (pontos.length === 0) return null;

  return (
    <MolduraProfit
      titulo={serie ? tituloSerie : titulo}
      legenda={
        <span className="inline-flex items-center gap-1.5">
          <AmostraDaLinha cores={CURVA_POR_OPERACAO} />
          {serie ? `${serie.legenda} · líquido` : `${legenda} · por fechamento`}
        </span>
      }
    >
      {/* no modo série a linha nasce no primeiro balde, não no zero da abertura: o coletor que subiu no meio
          do dia não pode virar uma rampa que nunca aconteceu (revisão de 23/09/2026) */}
      <DesenhoDaCurva
        id={id}
        pontos={pontos}
        cores={CURVA_POR_OPERACAO}
        altura={altura}
        rotulosX={serie ? serie.rotulosX : porFechamento.rotulosX}
        marcadores={serie ? serie.marcadores : marcadores}
        fechamentos={serie?.fechamentos}
        comecarNoPrimeiroPonto={serie !== null}
        formatarEixo={eixoEmReais}
        rotuloVertical="Saldo do dia (R$)"
        rotuloAria={serie ? "Saldo de hoje medido no MetaTrader 5 ao longo do pregão" : "Resultado acumulado de hoje, operação a operação"}
      />
    </MolduraProfit>
  );
});
