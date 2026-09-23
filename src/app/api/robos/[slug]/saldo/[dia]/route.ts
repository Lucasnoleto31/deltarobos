import { buscarRobo, listarOperacoesDoDia, listarSaldoDoDia } from "@/lib/consultas/publico";
import { ehDia, hojeSP } from "@/lib/stats/periodos";
import { fechamentosDasOperacoes, inferirBucketSeg } from "@/lib/stats/saldo-dia";
import type { SaldoDoDia } from "@/lib/tipos";

// sem revalidate do Next: o cache muda por dia (hoje curto, dia passado longo) e vai nos headers
export const dynamic = "force-dynamic";

/**
 * GET /api/robos/[slug]/saldo/[dia] — a série do saldo do dia medida pelo EA 1.1.2 (23/09/2026), como
 * SaldoDoDia em JSON compacto: os baldes [t, min, max, ultimo] em R$ brutos por contrato, o aviso de
 * aproximação, o tamanho do balde e os fechamentos [t, custo] das operações públicas do dia, com que o site
 * liquida a série no navegador (líquido no instante t = bruto − custos dos fechamentos até o fim do balde).
 * O "Hoje ao vivo" pede na assinatura do canal, ao voltar do segundo plano e quando o evento "saldo" (que só
 * cobre os últimos 30 s, sem replay) deixa um buraco; o calendário pede o dia selecionado sob demanda.
 *
 * Cache: o evento cobre 30 s, então a foto de hoje não pode passar de 15 s no CDN (+15 s de SWR = 30 s no
 * pior caso, coberto pelo evento e pelo vigia do hook) e max-age=0 impede o navegador de guardar; dia passado
 * não muda (o EA zera fila e balde na virada), então 1 h no CDN e 5 min no navegador. Falha do banco é 503
 * sem cache, como na rota da curva: a consulta normalmente engole o erro e devolve lista vazia, o que aqui
 * viraria uma série vazia guardada como resposta boa. Só dados públicos: o que saldo_dia_publico e
 * operacoes_publico publicam, e o n_magics vira o booleano `aproximado`. Nada de conta ou volume.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; dia: string }> }): Promise<Response> {
  const { slug, dia } = await params;
  if (!ehDia(dia)) return new Response("dia inválido, use YYYY-MM-DD", { status: 400 });
  const hoje = hojeSP();
  if (dia > hoje) return new Response("dia futuro", { status: 400 });

  let corpo: SaldoDoDia;
  try {
    // buscarRobo dentro do try e com lancarErro (revisão de 23/09/2026): a consulta engole a falha do banco e
    // devolve null, o que virava 404 "robô não encontrado" (sem no-store) em vez do 503; agora o 404 é só para
    // consulta que respondeu e não achou
    const robo = await buscarRobo(slug, { lancarErro: true });
    if (!robo) return new Response("robô não encontrado", { status: 404 });
    const [serie, ops] = await Promise.all([
      listarSaldoDoDia(slug, dia, { lancarErro: true }),
      listarOperacoesDoDia(slug, dia, { lancarErro: true }),
    ]);
    corpo = {
      dia,
      baldes: serie.baldes,
      aproximado: serie.aproximado,
      bucketSeg: inferirBucketSeg(serie.baldes),
      fechamentos: fechamentosDasOperacoes(ops),
      geradoEm: new Date().toISOString(),
    };
  } catch (e) {
    console.warn(`[saldo] ${slug}/${dia}: ${e instanceof Error ? e.message : String(e)}`);
    return new Response("dados indisponíveis no momento, tente de novo", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "5" },
    });
  }

  return Response.json(corpo, {
    headers: {
      "Cache-Control":
        dia === hoje ? "public, max-age=0, s-maxage=15, stale-while-revalidate=15" : "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
