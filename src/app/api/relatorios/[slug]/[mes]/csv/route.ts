import { buscarRobo } from "@/lib/consultas/publico";
import { ehMes, listarOperacoesDoMes } from "@/lib/consultas/relatorios";
import { formatarHoraSeg } from "@/lib/formato";
import { hojeSP, mesDe } from "@/lib/stats/periodos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function celula(v: string | number | null): string {
  if (v === null) return "";
  const s = typeof v === "number" ? String(v).replace(".", ",") : v;
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** GET /api/relatorios/[slug]/[mes]/csv — operações do mês em CSV (; e vírgula decimal). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; mes: string }> }) {
  const { slug, mes } = await params;
  if (!ehMes(mes)) return new Response("mês inválido, use YYYY-MM", { status: 400 });

  const robo = await buscarRobo(slug);
  if (!robo) return new Response("robô não encontrado", { status: 404 });

  const ops = await listarOperacoesDoMes(slug, mes);
  if (ops.length === 0) return new Response("sem operações nesse mês", { status: 404 });

  const cabecalho = [
    "robo",
    "dia",
    "abertura",
    "fechamento",
    "duracao_seg",
    "simbolo",
    "lado",
    "preco_entrada",
    "preco_saida",
    "pontos_por_contrato",
    "bruto_brl_por_contrato",
    "custos_brl_por_contrato",
    "liquido_brl_por_contrato",
    "origem",
  ];
  const linhas = ops.map((o) =>
    [
      robo.slug,
      o.dia_pregao,
      o.origem === "manual" ? null : formatarHoraSeg(o.abertura_em),
      formatarHoraSeg(o.fechamento_em),
      o.origem === "manual" ? null : o.duracao_seg,
      o.simbolo,
      o.lado,
      o.preco_entrada,
      o.preco_saida,
      o.pontos_por_contrato,
      o.resultado_brl_por_contrato,
      o.custos_brl_por_contrato,
      Math.round((o.resultado_brl_por_contrato - o.custos_brl_por_contrato) * 100) / 100,
      o.origem,
    ]
      .map(celula)
      .join(";"),
  );
  const csv = `﻿${cabecalho.join(";")}\n${linhas.join("\n")}\n`;

  const mesFechado = mes < mesDe(hojeSP());
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="delta-robos-${slug}-${mes}.csv"`,
      "Cache-Control": mesFechado ? "public, s-maxage=86400, stale-while-revalidate=604800" : "public, s-maxage=300",
    },
  });
}
