import { ImageResponse } from "next/og";
import { ACENTO, FIO, FUNDO, MUDO, NEGATIVO, SUTIL, TEXTO, corDoResultado as cor, partesDoValor } from "@/components/card/cores";
import { SIMBOLO_CAMINHOS, SIMBOLO_VIEWBOX } from "@/components/marca/Simbolo";
import { listarEstatisticas, listarRobos, resumoCasaHoje } from "@/lib/consultas/publico";
import { formatarBRL, formatarDataLonga, formatarHora } from "@/lib/formato";
import { hojeSP } from "@/lib/stats/periodos";
import { valorDia } from "@/lib/stats/serie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// as cores (tokens do tema escuro, a imagem não lê CSS) moram em components/card/cores desde 24/09/2026,
// junto com as da imagem do dia; desde a ficha Mesa (25/11/2026) são as do sistema novo

function brl(v: number): string {
  return formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 });
}

/**
 * O último pregão com operação, robô a robô, somado por contrato (mesma conta da home).
 * Só é buscado quando o dia de hoje está vazio, para a imagem não ficar de graça no fim de semana.
 */
async function ultimoPregaoDeTodos(hoje: string) {
  const [robos, estatisticas] = await Promise.all([listarRobos(), listarEstatisticas()]);
  const porRobo = new Map(robos.filter((r) => r.status !== "arquivado").map((r) => [r.slug, r]));

  let dia: string | null = null;
  for (const e of estatisticas) {
    if (porRobo.has(e.slug) && e.dia <= hoje && e.n_operacoes > 0 && (dia === null || e.dia > dia)) dia = e.dia;
  }
  if (dia === null) return null;

  const doDia = estatisticas.filter((e) => e.dia === dia && porRobo.has(e.slug));
  const lista = doDia
    .map((e) => {
      const robo = porRobo.get(e.slug)!;
      const o = { base: "liquido" as const, unidade: "brl" as const, valorPonto: robo.valor_ponto_brl };
      return { slug: e.slug, nome: robo.nome, valor: valorDia(e, o) };
    })
    .sort((a, b) => b.valor - a.valor);

  return { dia, robos: lista, total: lista.reduce((s, r) => s + r.valor, 0) };
}

/**
 * Imagem OG da home: o resultado do dia dos robôs somados. Desde a ficha Mesa (25/11/2026) tem a composição
 * das telas do sistema, sem caixa: a marca e a data em cima; o número grande, com o sinal e o "R$" mais
 * apagados e a premissa embaixo; e, depois de um fio, o resultado de cada robô numa linha. A informação é a
 * mesma de antes; os textos passaram para as palavras do site ("com 1 contrato", "já descontados os custos").
 *
 * Revisão dos indicadores (25/11/2026, DESIGN.md seção 9): a premissa diz "com 1 contrato por entrada em cada
 * robô", porque um robô pode ter várias entradas abertas ao mesmo tempo. A imagem continua sendo só o dia (o
 * de hoje ou o último pregão): não resume um período, não traz percentual nem média, e por isso não ganhou
 * outros números.
 */
export async function GET() {
  const hoje = hojeSP();
  const resumo = await resumoCasaHoje();
  const vivos = (resumo?.robos ?? [])
    .filter((r) => r.status === "ativo" || r.n_operacoes > 0)
    .sort((a, b) => b.resultado_liquido_por_contrato - a.resultado_liquido_por_contrato)
    .map((r) => ({ slug: r.slug, nome: r.nome, valor: r.resultado_liquido_por_contrato }));

  // Sem operação hoje (fim de semana, feriado, antes da abertura) a imagem mostra o último pregão com a
  // data, como a home desde 19/09/2026: um "R$ 0,00" compartilhado no sábado não diz nada.
  const passado = (resumo?.n_operacoes ?? 0) > 0 ? null : await ultimoPregaoDeTodos(hoje);
  const robos = (passado ? passado.robos : vivos).slice(0, 4);
  const total = passado ? passado.total : (resumo?.resultado_liquido_por_contrato ?? 0);
  const rotulo = passado ? "Resultado do último pregão, robôs somados" : "Resultado de hoje, robôs somados";
  const [prefixo, algarismos] = partesDoValor(robos.length > 0 ? brl(total) : "Em breve");
  const negativo = robos.length > 0 && total < 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: FUNDO,
          color: TEXTO,
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <svg width={44} height={43} viewBox={SIMBOLO_VIEWBOX}>
              {SIMBOLO_CAMINHOS.map((d, i) => (
                <path key={i} d={d} fill={ACENTO} />
              ))}
            </svg>
            <span style={{ display: "flex", gap: 8, fontSize: 28 }}>
              <span>Quants</span>
              <span style={{ color: MUDO }}>Robôs</span>
            </span>
          </div>
          <span style={{ fontSize: 22, color: MUDO }}>{formatarDataLonga(passado ? passado.dia : hoje)}</span>
        </div>

        {/* o número grande, como o do site: sinal e moeda mais apagados; negativo, vermelho inteiro */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 64 }}>
          <span style={{ fontSize: 28, color: MUDO }}>{rotulo}</span>
          <div style={{ display: "flex", alignItems: "flex-end", marginTop: 14 }}>
            {prefixo ? (
              <span style={{ fontSize: 120, lineHeight: 1, letterSpacing: -4, marginRight: 20, color: negativo ? NEGATIVO : MUDO }}>{prefixo}</span>
            ) : null}
            <span style={{ fontSize: 120, lineHeight: 1, letterSpacing: -4, color: negativo ? NEGATIVO : TEXTO }}>{algarismos}</span>
          </div>
          {robos.length > 0 ? (
            <span style={{ fontSize: 24, color: MUDO, marginTop: 18 }}>com 1 contrato por entrada em cada robô, já descontados os custos</span>
          ) : null}
        </div>

        {/* cada robô, depois de um fio */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginTop: "auto",
            borderTop: `1px solid ${FIO}`,
            paddingTop: 28,
          }}
        >
          <div style={{ display: "flex", gap: 56 }}>
            {robos.map((r) => (
              <div key={r.slug} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 22, color: MUDO }}>{r.nome}</span>
                <span style={{ fontSize: 36, color: cor(r.valor) }}>{brl(r.valor)}</span>
              </div>
            ))}
          </div>
          <span style={{ fontSize: 20, color: SUTIL }}>
            {passado ? "direto do MetaTrader 5" : `ao vivo, direto do MetaTrader 5 · ${formatarHora(new Date())}`}
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    },
  );
}
