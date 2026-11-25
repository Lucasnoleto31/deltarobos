"use client";

import { cn } from "cn";
import { useState } from "react";
import { LINK_DO_PAINEL } from "@/components/sistema/Painel";
import { formatarHoraSeg, formatarNumero } from "@/lib/formato";
import { supabaseBrowser } from "@/lib/supabase/cliente";
import type { OperacaoPublica } from "@/lib/tipos";
import type { FiltrosUrl } from "./params";

interface Props {
  slug: string;
  filtros: FiltrosUrl;
  total: number;
  className?: string;
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
 *
 * Ficha Mesa (25/11/2026): era um botão com borda e ícone no topo da aba; agora é um link de texto no pé
 * da tabela, ao lado da paginação. O texto diz que o arquivo traz todas as operações do filtro, não só as
 * 50 da página. É o arquivo que guarda o que saiu da tabela: símbolo, resultado antes dos custos e custos.
 *
 * Revisão de 25/11/2026: o texto diz "planilha", a mesma palavra dos arquivos de cada mês no pé da aba (o
 * "(CSV)" saiu do rótulo; o formato continua o mesmo). Este é o arquivo do que está filtrado; os de cada
 * mês, com o relatório em PDF, vêm na linha de baixo (ArquivosPorMes).
 */
export function BotaoCsv({ slug, filtros, total, className }: Props) {
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

  // sem operação não há o que baixar: o link nem aparece
  if (total === 0) return null;

  const rotulo =
    total > LIMITE
      ? `Baixar as ${formatarNumero(LIMITE)} mais recentes em planilha`
      : total === 1
        ? "Baixar em planilha"
        : "Baixar todas em planilha";

  return (
    <div className={cn("relative flex flex-col items-end", className)}>
      <button
        type="button"
        onClick={exportar}
        disabled={ocupado}
        // o texto é pequeno: o ::after aumenta a área de toque sem mexer no desenho
        className={cn(LINK_DO_PAINEL, "relative after:absolute after:-inset-x-2 after:-inset-y-2.5 disabled:pointer-events-none disabled:opacity-60")}
      >
        {ocupado ? "Gerando o arquivo…" : rotulo}
      </button>
      <p role="status" className={falhou ? "mt-1.5 text-xs text-foreground" : "sr-only"}>
        {falhou ? "O arquivo não foi gerado. Tente de novo." : ""}
      </p>
    </div>
  );
}
