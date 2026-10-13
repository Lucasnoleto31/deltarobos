import { ImageResponse } from "next/og";
import { formatarDiaCurto } from "@/components/home/datas";
import { ACENTO, FUNDO, MUDO, TEXTO, corDoResultado as cor } from "@/components/card/cores";
import { caminhoMonotono } from "@/components/graficos/curva-monotona";
import { SIMBOLO_CAMINHOS, SIMBOLO_VIEWBOX } from "@/components/marca/Simbolo";
import { buscarRobo, listarEstatisticas } from "@/lib/consultas/publico";
import { corDoRoboHex } from "@/lib/cores-robo";
import { formatarBRL, formatarHora, formatarNumero, formatarPct } from "@/lib/formato";
import { tamanhoParaCaber } from "@/lib/stats/card-do-dia";
import { calcularKpis } from "@/lib/stats/kpis";
import { hojeSP } from "@/lib/stats/periodos";
import { resumirCardRobo } from "@/lib/stats/resumo-robo";
import { valorDia } from "@/lib/stats/serie";
import type { OpcoesSerie } from "@/lib/stats/tipos";
import type { EstatisticaPublica } from "@/lib/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// as cores (tokens do tema escuro, a imagem não lê CSS) moram em components/card/cores desde 24/09/2026,
// junto com as da imagem do dia; o comportamento é o mesmo de antes.
// 13/10/2026 (mídia kit da Zeve): o símbolo é o "Z", 320 x 234, mais largo que o brasão antigo (a caixa
// segue a proporção dele, senão o desenho encolhe no meio da caixa); o robô ganha a cor dele (corDoRoboHex,
// pela ordem do banco) no ponto ao lado do nome e na curva dos últimos 30 dias, a mesma do card da home.
// O resultado continua verde, vermelho ou cinza pelo sinal.

/** a caixa do símbolo na proporção do viewBox (320 x 234) */
const SIMBOLO = { largura: 48, altura: 35 };

/** a curva dos 30 dias, à direita do número */
const CURVA = { largura: 400, altura: 150, margem: 8 };

/** largura que o número grande pode ocupar sem encostar na curva */
const LARGURA_NUMERO = 620;

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
 * A curva dos 30 dias em px, com a geometria da MiniCurva do site: escala do mínimo ao máximo, curva monótona e a
 * área fechando no zero quando a curva cruza o zero (senão na borda mais próxima dele). A margem deixa lugar para
 * o traço e para a bolinha do fim.
 */
function miniCurva(pontos: readonly number[]) {
  const { largura, altura, margem } = CURVA;
  const min = Math.min(...pontos);
  const max = Math.max(...pontos);
  const topo = margem;
  const fundo = altura - margem;
  const y = (v: number) => (max === min ? (topo + fundo) / 2 : fundo - ((v - min) / (max - min)) * (fundo - topo));
  const passo = (largura - 2 * margem) / (pontos.length - 1);
  const xs = pontos.map((_, i) => margem + i * passo);
  const ys = pontos.map(y);
  const linha = caminhoMonotono(xs, ys);
  const base = y(max < 0 ? max : Math.max(min, 0));
  const ultimo = xs.length - 1;
  return {
    linha,
    area: `${linha}L${xs[ultimo]},${base}L${xs[0]},${base}Z`,
    fim: { x: xs[ultimo], y: ys[ultimo] },
  };
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
  const corRobo = corDoRoboHex(robo.ordem);

  // Sem operação hoje (fim de semana, feriado, antes da abertura), a imagem mostra o último pregão com
  // a data, como a home desde 19/09/2026. Um "R$ 0,00" compartilhado no sábado não diz nada.
  const ultimo = ultimoPregao(linhas, opcoes, hoje);
  const passado = linhas.some((l) => l.dia === hoje && l.n_operacoes > 0) ? null : ultimo;
  const destaque = passado ? passado.valor : r.hoje;
  const rotuloDestaque = passado ? `Último pregão, por contrato · ${formatarDiaCurto(passado.dia)}` : "Resultado de hoje, por contrato";
  const textoDestaque = emBreve ? robo.nome : brl(destaque);
  const curva = !emBreve && r.sparkline.length >= 2 ? miniCurva(r.sparkline) : null;

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
            <svg width={SIMBOLO.largura} height={SIMBOLO.altura} viewBox={SIMBOLO_VIEWBOX}>
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

        {/* o robô (ponto na cor dele), o rótulo e o número; à direita, os 30 dias na cor do robô */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {emBreve ? null : (
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ display: "flex", width: 16, height: 16, borderRadius: 999, background: corRobo }} />
                <span style={{ fontSize: 34, fontWeight: 600 }}>{robo.nome}</span>
              </div>
            )}
            <span style={{ fontSize: 28, color: MUDO, marginTop: emBreve ? 0 : 18 }}>{emBreve ? "Em breve" : rotuloDestaque}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 10 }}>
              {emBreve ? <div style={{ display: "flex", width: 22, height: 22, borderRadius: 999, background: corRobo }} /> : null}
              <span
                style={{
                  fontSize: tamanhoParaCaber(textoDestaque, LARGURA_NUMERO, 96, 64),
                  fontWeight: 700,
                  color: emBreve ? MUDO : cor(destaque),
                  letterSpacing: -2,
                  lineHeight: 1,
                }}
              >
                {textoDestaque}
              </span>
            </div>
          </div>

          {curva ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              <span style={{ fontSize: 20, color: MUDO }}>Últimos 30 dias, acumulado</span>
              <svg width={CURVA.largura} height={CURVA.altura} viewBox={`0 0 ${CURVA.largura} ${CURVA.altura}`}>
                <defs>
                  <linearGradient id="og-curva" x1={0} y1={0} x2={0} y2={1}>
                    <stop offset={0} stopColor={corRobo} stopOpacity={0.32} />
                    <stop offset={1} stopColor={corRobo} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <path d={curva.area} fill="url(#og-curva)" />
                <path d={curva.linha} fill="none" stroke={corRobo} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={curva.fim.x} cy={curva.fim.y} r={6} fill={corRobo} />
              </svg>
            </div>
          ) : null}
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
