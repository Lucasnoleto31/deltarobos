"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatarHoraSeg, formatarNumero } from "@/lib/formato";
import { supabaseBrowser } from "@/lib/supabase/cliente";
import type { OperacaoPublica } from "@/lib/tipos";
import type { FiltrosUrl } from "./params";

interface Props {
  slug: string;
  filtros: FiltrosUrl;
  total: number;
}

const LIMITE = 50_000;

function celula(v: string | number | null): string {
  if (v === null) return "";
  const s = typeof v === "number" ? String(v).replace(".", ",") : v;
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Exporta a lista filtrada (até 50.000 linhas) em CSV com ; e vírgula decimal, pra abrir no Excel pt-BR.
 * 19/09/2026: a falha sai numa linha embaixo do botão, lida pelo leitor de tela, em vez do alerta do navegador.
 */
export function BotaoCsv({ slug, filtros, total }: Props) {
  const [ocupado, setOcupado] = useState(false);
  const [falhou, setFalhou] = useState(false);

  const exportar = async () => {
    setOcupado(true);
    setFalhou(false);
    try {
      const sb = supabaseBrowser();
      const linhas: OperacaoPublica[] = [];
      for (let de = 0; de < Math.min(total, LIMITE); de += 1000) {
        let q = sb.from("operacoes_publico").select("*").eq("slug", slug);
        if (filtros.de) q = q.gte("dia_pregao", filtros.de);
        if (filtros.ate) q = q.lte("dia_pregao", filtros.ate);
        if (filtros.lado) q = q.eq("lado", filtros.lado);
        if (filtros.resultado === "gain") q = q.gt("resultado_liquido_por_contrato", 0);
        if (filtros.resultado === "loss") q = q.lt("resultado_liquido_por_contrato", 0);
        const { data, error } = await q.order("fechamento_em", { ascending: false }).range(de, de + 999);
        if (error) throw error;
        linhas.push(...((data ?? []) as OperacaoPublica[]));
        if (!data || data.length < 1000) break;
      }

      const cabecalho = [
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
      ];
      const corpo = linhas.map((o) =>
        [
          o.dia_pregao,
          formatarHoraSeg(o.abertura_em),
          formatarHoraSeg(o.fechamento_em),
          o.duracao_seg,
          o.simbolo,
          o.lado,
          o.preco_entrada,
          o.preco_saida,
          o.pontos_por_contrato,
          o.resultado_brl_por_contrato,
          o.custos_brl_por_contrato,
          Math.round((o.resultado_brl_por_contrato - o.custos_brl_por_contrato) * 100) / 100,
        ]
          .map(celula)
          .join(";"),
      );
      const csv = `﻿${cabecalho.join(";")}\n${corpo.join("\n")}\n`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-operacoes${filtros.de ? `-${filtros.de}` : ""}${filtros.ate ? `-a-${filtros.ate}` : ""}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[csv] falha ao exportar", e);
      setFalhou(true);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <Button variant="outline" onClick={exportar} disabled={ocupado || total === 0}>
        <Download data-icon="inline-start" />
        {ocupado ? "Gerando…" : total > LIMITE ? `Exportar CSV (${formatarNumero(LIMITE)} mais recentes)` : "Exportar CSV"}
      </Button>
      <p role="status" className={falhou ? "mt-1.5 text-xs text-foreground" : "sr-only"}>
        {falhou ? "O CSV não foi gerado. Tente de novo." : ""}
      </p>
    </div>
  );
}
