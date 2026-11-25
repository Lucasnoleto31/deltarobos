import Link from "next/link";
import { GraficoBarras } from "@/components/desempenho/GraficoBarras";
import { PONTOS_LEVE, seriePorOperacaoCompacta, type SerieCompacta } from "@/components/graficos/series-da-curva";
import { ComoEleOpera } from "@/components/robo/ComoEleOpera";
import { opcoesDaCurva, recorteDoPeriodo } from "@/components/robo/curva-por-periodo";
import { PainelResultado } from "@/components/robo/PainelResultado";
import { PERIODOS_FECHADOS, VAZIO_DO_PERIODO, type PeriodoFechado } from "@/components/robo/periodos-resumo";
import { Transparencia } from "@/components/robo/Transparencia";
import { Grade } from "@/components/sistema/Pagina";
import { LINK_DO_PAINEL, Painel } from "@/components/sistema/Painel";
import { capitalDoRobo } from "@/lib/consultas/capital";
import { listarOperacoesCompactas } from "@/lib/consultas/operacoes";
import { buscarRobo, listarEstatisticas, listarFeriados } from "@/lib/consultas/publico";
import { formatarData, formatarMesAno, formatarNumero } from "@/lib/formato";
import { comoOpera, duracaoTipica, pregoesOperados } from "@/lib/stats/como-opera";
import { resultadoPorMes, tempoEmPalavras } from "@/lib/stats/indicadores-robo";
import { duracao } from "@/lib/stats/operacoes";
import { hojeSP } from "@/lib/stats/periodos";
import { ordenarPorDia, valorDia } from "@/lib/stats/serie";
import type { LinhaDiaria } from "@/lib/stats/tipos";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Aba "Resumo" do robô (revisão de 25/11/2026, DESIGN.md seção 9). Responde a uma pergunta: este robô vale a
 * pena? Quanto ganhou e quanto caiu no caminho? De cima para baixo, sem caixas:
 *
 * - o resultado desde o início em número grande, com a premissa e o tamanho do histórico, os fatos ao lado
 *   (maior queda e se já recuperou, ganho para cada R$ 1 da maior queda, capital mínimo, meses e dias com
 *   ganho) e a curva com a maior queda em vermelho (PainelResultado);
 * - o resultado de cada mês, em barras;
 * - "Como ele opera", em lista, ao lado de "De onde vêm os números".
 *
 * O que saiu: o período "Hoje" (é a aba Ao vivo), "Últimas operações" (é a aba Operações), "Mais números" e o
 * link para a aba Desempenho, que deixou de existir. As contas estão em lib/stats/como-opera e
 * lib/stats/indicadores-robo; o capital mínimo vem de capitalDoRobo, o mesmo número do cabeçalho. O botão
 * "Quero esse robô" está no cabeçalho, que é do layout.
 */
export default async function PaginaRobo({ params }: Props) {
  const { slug } = await params;
  const hoje = hojeSP();
  const [robo, todas, ops, feriados, capital] = await Promise.all([
    buscarRobo(slug),
    listarEstatisticas(slug),
    // as operações ficam no servidor: daqui saem a curva por operação de cada período e a duração típica
    listarOperacoesCompactas(slug),
    listarFeriados(),
    capitalDoRobo(slug),
  ]);
  if (!robo) return null; // o layout já tratou o 404

  if (robo.status === "em_breve") {
    return (
      <>
        <p className="py-10 text-sm text-muted-foreground">Este robô ainda não começou a operar em conta real.</p>
        <Transparencia robo={robo} />
      </>
    );
  }

  const linhas = ordenarPorDia(todas.filter((l) => l.dia <= hoje));
  if (linhas.length === 0) {
    return (
      <>
        <p className="py-10 text-sm text-muted-foreground">{VAZIO_DO_PERIODO.tudo}</p>
        <Transparencia robo={robo} />
      </>
    );
  }

  // Curva "por operação": as operações (dezenas de milhares) não vão para o navegador. A série de
  // cada período é montada aqui na versão leve (PONTOS_LEVE pontos), para pintar na hora, e só os
  // números dela seguem; a dica é escrita no navegador (18/09/2026: com ela pronta, as quatro séries
  // eram 54% do HTML). A série fiel, operação a operação, vem sob demanda pela rota
  // /api/robos/[slug]/curva/[periodo] (22/09/2026), montada com o mesmo recorte (recorteDoPeriodo).
  const opcoes = opcoesDaCurva(robo.valor_ponto_brl);
  // Os períodos se encaixam (semana dentro do mês, do ano, de tudo) e todos terminam hoje: mesma contagem
  // de operações e de dias é o mesmo recorte. Aí vai o mesmo objeto, que o React serializa uma vez só
  // ("ano" e "tudo" enquanto o robô tiver começado no ano corrente).
  const jaMontadas = new Map<string, SerieCompacta>();
  const pontosPorOperacao = Object.fromEntries(
    PERIODOS_FECHADOS.map((periodo) => {
      const { ops: opsDoPeriodo, dias } = recorteDoPeriodo(ops, todas, periodo, hoje, opcoes);
      const chave = `${opsDoPeriodo.length}:${dias.length}`;
      const serie = jaMontadas.get(chave) ?? seriePorOperacaoCompacta(opsDoPeriodo, opcoes, dias, { maxPontos: PONTOS_LEVE });
      jaMontadas.set(chave, serie);
      return [periodo, serie];
    }),
  ) as Record<PeriodoFechado, SerieCompacta>;

  // O painel é client: vão só os campos da série diária, sem robo_id, slug e atualizado_em em cada linha.
  const linhasDoPainel = linhas.map(
    (l): LinhaDiaria => ({
      dia: l.dia,
      pontos_por_contrato: l.pontos_por_contrato,
      resultado_brl_por_contrato: l.resultado_brl_por_contrato,
      custos_brl_por_contrato: l.custos_brl_por_contrato,
      n_operacoes: l.n_operacoes,
      n_gain: l.n_gain,
      n_loss: l.n_loss,
      soma_gain_brl_por_contrato: l.soma_gain_brl_por_contrato,
      soma_loss_brl_por_contrato: l.soma_loss_brl_por_contrato,
      maior_gain_brl_por_contrato: l.maior_gain_brl_por_contrato,
      maior_loss_brl_por_contrato: l.maior_loss_brl_por_contrato,
    }),
  );

  const primeiroDia = linhas[0].dia;
  const ultimoDia = linhas[linhas.length - 1].dia;

  // as barras são do histórico inteiro, um mês por barra; com um mês só, a barra única repetiria o número grande
  const meses = resultadoPorMes(linhas.map((l) => ({ dia: l.dia, valor: valorDia(l, opcoes) })));
  const barras = meses.map((m) => ({ rotulo: formatarMesAno(`${m.mes}-01`), valor: m.valor, n: m.nDias }));

  const como = comoOpera(linhas);
  // as operações mais recentes (até o teto da consulta) bastam para dizer quanto dura uma operação
  const duracaoSeg = duracaoTipica(ops.map(duracao));
  const pregoes = pregoesOperados(
    linhas.filter((l) => l.n_operacoes > 0).map((l) => l.dia),
    feriados,
  );

  return (
    <>
      <PainelResultado
        linhas={linhasDoPainel}
        pontosPorOperacao={pontosPorOperacao}
        valorPonto={robo.valor_ponto_brl}
        capitalMinimo={capital?.capitalMinimo ?? null}
      />

      {barras.length > 1 ? (
        <Painel
          id="por-mes"
          titulo="Resultado por mês"
          apoio={`desde ${formatarData(primeiroDia)}`}
          fio={false}
          acao={
            <Link href={`/robos/${slug}/calendario`} className={LINK_DO_PAINEL}>
              Ver dia a dia
            </Link>
          }
        >
          <GraficoBarras dados={barras} unidade="brl" altura={220} rotuloN="Pregões" />
        </Painel>
      ) : null}

      <Grade>
        <Painel
          id="como-opera"
          titulo="Como ele opera"
          // o tamanho da amostra vai escrito: indicador de histórico curto não se lê como o de anos
          apoio={`em ${tempoEmPalavras(primeiroDia, ultimoDia)} de histórico, ${formatarNumero(como.operacoes)} ${como.operacoes === 1 ? "operação" : "operações"}`}
          corpo=""
          className="xl:col-span-7"
          acao={
            <Link href={`/robos/${slug}/operacoes`} className={LINK_DO_PAINEL}>
              Ver as operações
            </Link>
          }
        >
          <ComoEleOpera
            como={como}
            duracaoSeg={duracaoSeg}
            pregoes={pregoes}
            entradas={capital && capital.entradasEm !== null ? { maximo: capital.entradas, em: capital.entradasEm } : null}
          />
        </Painel>
        <Transparencia robo={robo} className="xl:col-span-5" />
      </Grade>
    </>
  );
}
