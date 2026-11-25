import type { Metadata } from "next";
import { PainelCalendario } from "@/components/calendario/PainelCalendario";
import { empacotar, soLinhaDiaria } from "@/components/compartilhados/ops-codec";
import { listarOperacoesCompactas } from "@/lib/consultas/operacoes";
import { buscarRobo, listarEstatisticas, listarExposicaoDia, listarFeriados, listarMercado } from "@/lib/consultas/publico";
import { hojeSP } from "@/lib/stats/periodos";
import { horarioDaJanela } from "@/lib/stats/saldo-dia";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  // o título da aba no navegador é o nome que ela tem na faixa de abas desde a ficha Mesa (25/11/2026)
  return { title: robo ? `${robo.nome} · Dia a dia` : "Dia a dia" };
}

/**
 * Aba "Dia a dia" (rota /calendario; ficha Mesa, 25/11/2026): o resultado do mês em vista, o mês em casas com
 * o dia escolhido ao lado, os melhores e os piores dias do histórico e o mapa de todos os meses. Aqui só se
 * buscam os dados; o desenho inteiro é do PainelCalendario, que devolve as seções para o CorpoPagina do
 * layout do robô.
 */
export default async function PaginaCalendario({ params }: Props) {
  const { slug } = await params;
  const hoje = hojeSP();
  const [robo, linhas, ops, feriados, exposicao, mercado] = await Promise.all([
    buscarRobo(slug),
    listarEstatisticas(slug),
    listarOperacoesCompactas(slug),
    listarFeriados(),
    // MEP/MEN por dia medidos pelo EA 1.1.0 (22/09/2026): uma linha por dia com medição, já sem robo_id
    listarExposicaoDia(slug),
    // o pregão do ativo dimensiona o eixo do tempo da série do saldo do dia quando o robô não tem horário (23/09/2026)
    listarMercado(),
  ]);
  if (!robo) return null;
  const m = mercado.find((x) => x.prefixo_simbolo === robo.ativo);
  const horario = horarioDaJanela(robo, m ? { inicio: m.pregao_inicio, fim: m.pregao_fim } : { inicio: "09:00", fim: "18:00" });

  return (
    <PainelCalendario
      linhas={soLinhaDiaria(linhas)}
      pacote={empacotar(ops)}
      exposicao={exposicao}
      feriados={feriados}
      hoje={hoje}
      valorPonto={robo.valor_ponto_brl}
      custoPorContrato={robo.custo_por_contrato}
      slug={robo.slug}
      nomeRobo={robo.nome}
      contaDemo={robo.conta_tipo === "demo"}
      temColetor={robo.tem_coletor}
      horario={horario}
    />
  );
}
