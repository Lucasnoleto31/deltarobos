import Link from "next/link";
import { PONTOS_LEVE, seriePorOperacaoCompacta, type SerieCompacta } from "@/components/graficos/series-da-curva";
import { opcoesDaCurva, recorteDoPeriodo } from "@/components/robo/curva-por-periodo";
import { KpisRobo } from "@/components/robo/KpisRobo";
import { PainelResultado } from "@/components/robo/PainelResultado";
import { PERIODOS_FECHADOS, type PeriodoFechado } from "@/components/robo/periodos-resumo";
import { Transparencia } from "@/components/robo/Transparencia";
import { UltimasOperacoes } from "@/components/robo/UltimasOperacoes";
import { Grade } from "@/components/sistema/Pagina";
import { LINK_DO_PAINEL, Painel } from "@/components/sistema/Painel";
import { listarOperacoesCompactas } from "@/lib/consultas/operacoes";
import { buscarRobo, listarEstatisticas, listarUltimasOperacoes } from "@/lib/consultas/publico";
import { formatarData } from "@/lib/formato";
import { hojeSP } from "@/lib/stats/periodos";
import type { LinhaDiaria } from "@/lib/stats/tipos";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Aba "Visão geral" do robô (ficha Mesa, 25/11/2026, segunda passada). É a página inicial filtrada para um
 * robô: o resultado do período em número grande (hoje ao vivo, semana, mês, ano, tudo), os fatos ao lado e
 * a curva; embaixo, as últimas operações e "mais números", lado a lado; por fim, de onde vêm os números.
 * Sem caixas. O botão "Quero esse robô" está no cabeçalho, que é do layout.
 */
export default async function PaginaRobo({ params }: Props) {
  const { slug } = await params;
  const hoje = hojeSP();
  const [robo, linhas, ultimas, ops] = await Promise.all([
    buscarRobo(slug),
    listarEstatisticas(slug),
    listarUltimasOperacoes(slug, 12),
    // a mesma consulta que a aba Desempenho já faz; aqui ela fica no servidor (ver abaixo)
    listarOperacoesCompactas(slug),
  ]);
  if (!robo) return null; // o layout já tratou o 404

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
      const { ops: opsDoPeriodo, dias } = recorteDoPeriodo(ops, linhas, periodo, hoje, opcoes);
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

  const primeiroDia = linhas.reduce<string | null>((m, l) => (m === null || l.dia < m ? l.dia : m), null);

  if (robo.status === "em_breve") {
    return (
      <>
        <p className="py-10 text-sm text-muted-foreground">Este robô ainda não começou a operar em conta real.</p>
        <Transparencia robo={robo} />
      </>
    );
  }

  // Num dia de muitas operações, as últimas são todas de hoje, e a lista só repetiria as "operações de hoje"
  // logo acima. Ela aparece quando traz alguma coisa de outro dia (17/09/2026).
  const ultimasSoDeHoje = ultimas.length > 0 && ultimas.every((o) => o.dia_pregao === hoje);

  const maisNumeros = (
    <Painel
      id="mais-numeros"
      titulo="Mais números"
      apoio={primeiroDia ? `desde ${formatarData(primeiroDia)}` : undefined}
      corpo=""
      className={ultimasSoDeHoje ? undefined : "xl:col-span-5"}
      acao={
        <Link href={`/robos/${slug}/desempenho`} className={LINK_DO_PAINEL}>
          Desempenho completo
        </Link>
      }
    >
      <KpisRobo
        linhas={linhas}
        valorPonto={robo.valor_ponto_brl}
        capitalReferencia={robo.capital_referencia}
        hoje={hoje}
        className={ultimasSoDeHoje ? undefined : "lg:grid-cols-1"}
      />
    </Painel>
  );

  return (
    <>
      <PainelResultado
        linhas={linhasDoPainel}
        pontosPorOperacao={pontosPorOperacao}
        valorPonto={robo.valor_ponto_brl}
        capitalReferencia={robo.capital_referencia}
      />

      {ultimasSoDeHoje ? (
        maisNumeros
      ) : (
        <Grade>
          <Painel
            id="ultimas"
            titulo="Últimas operações"
            corpo=""
            className="xl:col-span-7"
            acao={
              <Link href={`/robos/${slug}/operacoes`} className={LINK_DO_PAINEL}>
                Lista completa
              </Link>
            }
          >
            <UltimasOperacoes operacoes={ultimas} />
          </Painel>
          {maisNumeros}
        </Grade>
      )}

      <Transparencia robo={robo} />
    </>
  );
}
