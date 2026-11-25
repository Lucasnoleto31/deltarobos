import { ImageResponse } from "next/og";
import { formatarDiaCurto } from "@/components/home/datas";
import { ACENTO, ALERTA, FIO, FUNDO, MUDO, NEGATIVO, TEXTO, corDoResultado as cor, partesDoValor } from "@/components/card/cores";
import { SIMBOLO_CAMINHOS, SIMBOLO_VIEWBOX } from "@/components/marca/Simbolo";
import { buscarRobo, listarEstatisticas } from "@/lib/consultas/publico";
import { formatarBRL, formatarHora, formatarNumero, formatarPct } from "@/lib/formato";
import { calcularKpis } from "@/lib/stats/kpis";
import { hojeSP } from "@/lib/stats/periodos";
import { resumirCardRobo } from "@/lib/stats/resumo-robo";
import { valorDia } from "@/lib/stats/serie";
import type { OpcoesSerie } from "@/lib/stats/tipos";
import type { EstatisticaPublica } from "@/lib/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// as cores (tokens do tema escuro, a imagem não lê CSS) moram em components/card/cores desde 24/09/2026,
// junto com as da imagem do dia; desde a ficha Mesa (25/11/2026) são as do sistema novo

function brl(v: number): string {
  return formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 });
}

/** Último dia com operação até hoje, somado (mesma conta da home). */
function ultimoPregao(
  linhas: readonly EstatisticaPublica[],
  o: OpcoesSerie,
  hoje: string,
): { dia: string; valor: number } | null {
  let dia: string | null = null;
  for (const l of linhas) {
    if (l.dia <= hoje && l.n_operacoes > 0 && (dia === null || l.dia > dia)) dia = l.dia;
  }
  if (dia === null) return null;
  const valor = linhas.filter((l) => l.dia === dia).reduce((s, l) => s + valorDia(l, o), 0);
  return { dia, valor };
}

/**
 * Imagem OG do robô com o resultado do dia (spec §8.8). Cache de 60s.
 *
 * Desde a ficha Mesa (25/11/2026) tem a composição das telas do sistema, sem caixa: a marca e o ativo em cima;
 * o nome do robô e de quando é o número; o número grande, com o sinal e o "R$" mais apagados e a premissa
 * embaixo; e, depois de um fio, os fatos numa linha. A informação é a de antes (o dia, o mês, desde o início,
 * acertos e operações), mais a maior queda de todo o histórico: onde aparece ganho, aparece o risco. Os rótulos
 * passaram para as palavras do site: "Novembro" no lugar de "Mês", "Desde o início" no de "Acumulado",
 * "com 1 contrato, já descontados os custos" no de "por contrato, líquido de custos".
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  if (!robo) return new Response("robô não encontrado", { status: 404 });

  const hoje = hojeSP();
  const linhas = await listarEstatisticas(slug);
  const opcoes = { base: "liquido" as const, unidade: "brl" as const, valorPonto: robo.valor_ponto_brl };
  const r = resumirCardRobo(linhas, opcoes, hoje);
  const k = calcularKpis(linhas, opcoes, { hoje, capitalReferencia: robo.capital_referencia });
  const emBreve = robo.status === "em_breve";

  // Sem operação hoje (fim de semana, feriado, antes da abertura), a imagem mostra o último pregão com
  // a data, como a home desde 19/09/2026. Um "R$ 0,00" compartilhado no sábado não diz nada.
  const ultimo = ultimoPregao(linhas, opcoes, hoje);
  const passado = linhas.some((l) => l.dia === hoje && l.n_operacoes > 0) ? null : ultimo;
  const destaque = passado ? passado.valor : r.hoje;
  const quando = passado ? `último pregão · ${formatarDiaCurto(passado.dia)}` : "resultado de hoje";
  const [prefixo, algarismos] = partesDoValor(brl(destaque));
  const negativo = destaque < 0;

  const nomeDoMes = new Date(`${hoje}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
  const mes = nomeDoMes.charAt(0).toUpperCase() + nomeDoMes.slice(1);

  const Fato = ({ rotulo, valor, tom }: { rotulo: string; valor: string; tom: string }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 22, color: MUDO }}>{rotulo}</span>
      <span style={{ fontSize: 36, color: tom }}>{valor}</span>
    </div>
  );

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
          <div style={{ display: "flex", gap: 20, fontSize: 22 }}>
            <span style={{ color: MUDO }}>{`${robo.ativo_nome} · ${robo.ativo}`}</span>
            {robo.conta_tipo === "demo" ? <span style={{ color: ALERTA }}>Conta demo</span> : null}
          </div>
        </div>

        {/* o robô, de quando é o número e o número grande, como o do site: sinal e moeda mais apagados; negativo, vermelho inteiro */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 52 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
            <span style={{ fontSize: 44, lineHeight: 1.1 }}>{robo.nome}</span>
            <span style={{ fontSize: 28, lineHeight: 1.1, color: MUDO, paddingBottom: 4 }}>{emBreve ? "em breve" : quando}</span>
          </div>
          {emBreve ? null : (
            <div style={{ display: "flex", alignItems: "flex-end", marginTop: 18 }}>
              {prefixo ? (
                <span style={{ fontSize: 120, lineHeight: 1, letterSpacing: -4, marginRight: 20, color: negativo ? NEGATIVO : MUDO }}>{prefixo}</span>
              ) : null}
              <span style={{ fontSize: 120, lineHeight: 1, letterSpacing: -4, color: negativo ? NEGATIVO : TEXTO }}>{algarismos}</span>
            </div>
          )}
          <span style={{ fontSize: 24, color: MUDO, marginTop: 18 }}>
            {emBreve
              ? "Os números aparecem assim que a primeira operação fechar."
              : `com 1 contrato, já descontados os custos · direto do MetaTrader 5${passado ? "" : ` · ${formatarHora(new Date())}`}`}
          </span>
        </div>

        {emBreve ? null : (
          // os fatos, depois de um fio
          <div style={{ display: "flex", gap: 52, marginTop: "auto", borderTop: `1px solid ${FIO}`, paddingTop: 26 }}>
            <Fato rotulo={mes} valor={brl(r.mes)} tom={cor(r.mes)} />
            <Fato rotulo="Desde o início" valor={brl(r.acumulado)} tom={cor(r.acumulado)} />
            <Fato rotulo="Maior queda" valor={r.drawdownMaximo > 0 ? brl(-r.drawdownMaximo) : "nenhuma"} tom={r.drawdownMaximo > 0 ? NEGATIVO : MUDO} />
            <Fato rotulo="Acertos" valor={formatarPct(k.taxaAcerto, 0)} tom={TEXTO} />
            <Fato rotulo="Operações" valor={formatarNumero(k.nOperacoes)} tom={TEXTO} />
          </div>
        )}
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    },
  );
}
