import type { Metadata } from "next";
import { PainelRisco } from "@/components/risco/PainelRisco";
import { capitalDoRobo } from "@/lib/consultas/capital";
import { buscarRobo, listarEstatisticas, listarExposicaoDia } from "@/lib/consultas/publico";
import { hojeSP } from "@/lib/stats/periodos";
import { contaDoCapital, piorMomentoMedido, resultadoPorOperacao, riscoDoRobo } from "@/lib/stats/risco";
import { ordenarPorDia, valorDia } from "@/lib/stats/serie";
import { LIMITE_APERTADO } from "@/lib/stats/simulador";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  // o título é o nome que a aba tem na tela desde a ficha Mesa (25/11/2026)
  return { title: robo ? `${robo.nome} · Quedas e risco` : "Quedas e risco" };
}

/**
 * Aba "Quedas e risco" (revisão de 25/11/2026, DESIGN.md seção 9): quanto posso perder e quanto capital
 * preciso? A página busca e chama as contas puras; o desenho é do PainelRisco.
 *
 * - A série diária vira data e valor (R$, 1 contrato por entrada, menos o custo do robô) e riscoDoRobo lê o histórico
 *   inteiro: a maior queda com as datas, as outras quedas e os dias ruins. Só data e valor de cada pregão vão
 *   ao navegador, para a curva; as operações não são mais buscadas (serviam ao risco de ruína, que saiu).
 * - O capital mínimo e as parcelas vêm de capitalDoRobo, a mesma leitura das outras telas; contaDoCapital só
 *   fecha as parcelas em R$ inteiros. O limite de "apertado" é o do simulador.
 * - O pior momento dentro de um pregão sai das medições do coletor (exposicao_dia_publico), só nos pregões
 *   que estão na série; sem medição a linha não aparece.
 */
export default async function PaginaRisco({ params }: Props) {
  const { slug } = await params;
  const hoje = hojeSP();
  const [robo, linhas, capital, exposicao] = await Promise.all([
    buscarRobo(slug),
    listarEstatisticas(slug),
    capitalDoRobo(slug),
    listarExposicaoDia(slug),
  ]);
  if (!robo) return null; // o layout já tratou o 404

  const opcoes = { base: "liquido", unidade: "brl", valorPonto: robo.valor_ponto_brl } as const;
  const ateHoje = ordenarPorDia(linhas.filter((l) => l.dia <= hoje));
  const dias = ateHoje.map((l) => ({ dia: l.dia, valor: valorDia(l, opcoes) }));

  return (
    <PainelRisco
      slug={slug}
      dias={dias.map((d) => [d.dia, d.valor] as const)}
      risco={riscoDoRobo(dias)}
      capital={capital}
      conta={capital ? contaDoCapital(capital, LIMITE_APERTADO) : null}
      limite={LIMITE_APERTADO}
      momento={piorMomentoMedido(exposicao, dias, robo.custo_por_contrato, robo.valor_ponto_brl)}
      porOperacao={resultadoPorOperacao(ateHoje)}
      custoPorContrato={robo.custo_por_contrato}
    />
  );
}
