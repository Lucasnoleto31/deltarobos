"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ehCorpoSaldoDoDia } from "@/lib/stats/saldo-dia";
import type { SaldoDoDia } from "@/lib/tipos";

/**
 * A série do saldo do dia escolhido, medida pelo EA 1.1.2 (23/09/2026): carregada sob demanda pela rota
 * /api/robos/[slug]/saldo/[dia] e guardada por dia nesta instância (o próprio estado é o cache: voltar a
 * um dia já visto não pede de novo). "erro" também fica guardado, para o "Tentar de novo" ser um gesto
 * da pessoa e não um laço de pedidos. Sem coletor não há o que pedir: o robô só tem histórico importado.
 * O setSaldos só acontece na resposta, nunca no corpo do efeito.
 *
 * Saiu do PainelCalendario em 25/11/2026 (ficha Mesa), quando o painel foi dividido em arquivos; a lógica é a
 * mesma. Quem chama é o painel, que fica montado o tempo todo: trocar de mês não esvazia o cache.
 */
export function useSaldoDoDia(slug: string, dia: string | null, temColetor: boolean) {
  const [saldos, setSaldos] = useState<Record<string, SaldoDoDia | "erro">>({});
  const emVoo = useRef(new Map<string, AbortController>());

  useEffect(() => {
    if (!temColetor || !dia || dia in saldos || emVoo.current.has(dia)) return;
    const pedido = dia;
    const controle = new AbortController();
    emVoo.current.set(pedido, controle);
    const concluir = () => {
      // só o próprio pedido sai do mapa: um pedido cancelado (StrictMode) não pode apagar o que o substituiu
      if (emVoo.current.get(pedido) === controle) emVoo.current.delete(pedido);
    };
    fetch(`/api/robos/${encodeURIComponent(slug)}/saldo/${pedido}`, { signal: controle.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const corpo: unknown = await r.json();
        // o JSON vem de fora: a forma é conferida antes de entrar no estado, como mesmoRecorte faz com a curva
        if (!ehCorpoSaldoDoDia(corpo) || corpo.dia !== pedido) throw new Error("resposta em formato inesperado");
        return corpo;
      })
      .then(
        (corpo) => {
          concluir();
          if (controle.signal.aborted) return;
          setSaldos((s) => ({ ...s, [pedido]: corpo }));
        },
        (e: unknown) => {
          concluir();
          if (controle.signal.aborted) return;
          console.warn(`[calendario] saldo de ${pedido}:`, e);
          setSaldos((s) => ({ ...s, [pedido]: "erro" }));
        },
      );
  }, [dia, slug, temColetor, saldos]);

  // desmontar cancela o que está no ar: a resposta não cai num componente morto
  useEffect(() => {
    const mapa = emVoo.current;
    return () => {
      for (const c of mapa.values()) c.abort();
      mapa.clear();
    };
  }, []);

  // tirar o dia do cache faz o efeito pedir de novo (o "Tentar de novo" do erro)
  const tentarDeNovo = useCallback(
    (qual: string) => setSaldos((s) => Object.fromEntries(Object.entries(s).filter(([d]) => d !== qual))),
    [],
  );

  const saldo = dia ? saldos[dia] : undefined;
  return {
    saldo,
    /** a rota ainda não respondeu para este dia */
    carregando: temColetor && dia !== null && saldo === undefined,
    tentarDeNovo,
  };
}
