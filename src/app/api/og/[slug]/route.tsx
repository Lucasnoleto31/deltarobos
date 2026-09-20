import { ImageResponse } from "next/og";
import { formatarDiaCurto } from "@/components/home/datas";
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

// as mesmas cores dos tokens do tema escuro (globals.css): a imagem não lê CSS. O acento é o verde da
// Quants (19/09/2026, no lugar do dourado); o verde do resultado continua o de cor()
const FUNDO = "#0a0a0b";
const TEXTO = "#f8f5ef";
const MUDO = "#aca496";
const ACENTO = "#00ff88";

function cor(v: number): string {
  return v > 0 ? "#53b86f" : v < 0 ? "#e8594b" : MUDO;
}

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

/** Imagem OG do robô com o resultado do dia (spec §8.8). Cache de 60s. */
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
  const rotuloDestaque = passado ? `Último pregão, por contrato · ${formatarDiaCurto(passado.dia)}` : "Resultado de hoje, por contrato";

  const Stat = ({ rotulo, valor, tom }: { rotulo: string; valor: string; tom: string }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 22, color: MUDO }}>{rotulo}</span>
      <span style={{ fontSize: 44, fontWeight: 700, color: tom }}>{valor}</span>
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
          justifyContent: "space-between",
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
            <span style={{ display: "flex", gap: 8, fontSize: 28, fontWeight: 600 }}>
              <span>Quants</span>
              <span style={{ color: MUDO }}>Robôs</span>
            </span>
          </div>
          <span style={{ fontSize: 22, color: MUDO }}>
            {robo.ativo_nome} · {robo.ativo}
            {robo.conta_tipo === "demo" ? " · conta demo" : ""}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 30, color: MUDO }}>{emBreve ? "Em breve" : rotuloDestaque}</span>
          <span style={{ fontSize: 96, fontWeight: 700, color: emBreve ? MUDO : cor(destaque), letterSpacing: -2 }}>
            {emBreve ? robo.nome : brl(destaque)}
          </span>
          {emBreve ? null : <span style={{ fontSize: 34, fontWeight: 600 }}>{robo.nome}</span>}
        </div>

        {emBreve ? (
          <span style={{ fontSize: 24, color: MUDO }}>Estatísticas assim que a primeira operação fechar.</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", gap: 56 }}>
              <Stat rotulo="Mês" valor={brl(r.mes)} tom={cor(r.mes)} />
              <Stat rotulo="Acumulado" valor={brl(r.acumulado)} tom={cor(r.acumulado)} />
              <Stat rotulo="Acerto" valor={formatarPct(k.taxaAcerto, 0)} tom={TEXTO} />
              <Stat rotulo="Operações" valor={formatarNumero(k.nOperacoes)} tom={TEXTO} />
            </div>
            <span style={{ fontSize: 20, color: MUDO }}>
              {passado ? "líquido de custos, direto do MetaTrader 5" : `líquido de custos · ${formatarHora(new Date())}`}
            </span>
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
