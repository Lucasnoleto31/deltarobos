import { PONTOS_FIEL, type SerieCompacta } from "@/components/graficos/series-da-curva";
import { curvaDoPeriodo, opcoesDaCurva } from "@/components/robo/curva-por-periodo";
import { ehPeriodoFechado, inicioDoPeriodo } from "@/components/robo/periodos-resumo";
import { listarOperacoesCompactas } from "@/lib/consultas/operacoes";
import { buscarRobo, listarEstatisticas } from "@/lib/consultas/publico";
import { hojeSP } from "@/lib/stats/periodos";

// A mesma janela da página do robô: a resposta fica em cache 60 s e é remontada depois disso.
export const revalidate = 60;
// as operações vêm em páginas de 1.000 (dezenas de milhares no robô antigo): o mesmo teto do CSV
export const maxDuration = 60;

/**
 * GET /api/robos/[slug]/curva/[periodo] — a curva por operação completa do período (semana, mes, ano,
 * tudo), como SerieCompacta em JSON: uma operação por ponto até PONTOS_FIEL, acima disso agrupada. A
 * visão geral chega com a série leve de PONTOS_LEVE pontos e pede esta quando o visitante abre "Por
 * operação" (22/09/2026, Lucas: "o gráfico por operações está igual por dia"). Montada com o mesmo
 * recorte e as mesmas opções da página (curvaDoPeriodo), só com dados das views públicas: dias,
 * total de operações e os números de cada ponto; nada de conta, volume ou preço.
 *
 * Só o período vem do banco (semana, mês e ano filtram por dia; "tudo" traz tudo), e o recorte em
 * memória é o mesmo da página. Falha do banco é 503 sem cache: as consultas normalmente engolem o erro
 * e devolvem lista vazia, o que aqui viraria uma série vazia guardada por minutos como resposta boa.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; periodo: string }> }) {
  const { slug, periodo } = await params;
  if (!ehPeriodoFechado(periodo)) return new Response("período inválido, use semana, mes, ano ou tudo", { status: 400 });

  const robo = await buscarRobo(slug);
  if (!robo) return new Response("robô não encontrado", { status: 404 });

  const hoje = hojeSP();
  const de = inicioDoPeriodo(periodo, hoje);
  let serie: SerieCompacta;
  try {
    const [ops, linhas] = await Promise.all([
      listarOperacoesCompactas(slug, { de, lancarErro: true }),
      listarEstatisticas(slug, { de, lancarErro: true }),
    ]);
    serie = curvaDoPeriodo(ops, linhas, periodo, hoje, opcoesDaCurva(robo.valor_ponto_brl), PONTOS_FIEL);
  } catch (e) {
    console.warn(`[curva] ${slug}/${periodo}: ${e instanceof Error ? e.message : String(e)}`);
    return new Response("dados indisponíveis no momento, tente de novo", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "5" },
    });
  }

  return Response.json(serie, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
