"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/cliente";
import type { EventoColeta, EventoCotacao, MercadoPublico, ResumoCasa, RoboPublico } from "@/lib/tipos";

export interface EstadoCasaAoVivo {
  resumo: ResumoCasa | null;
  mercado: MercadoPublico[];
  /** saúde do coletor por slug */
  coleta: Record<string, EventoColeta>;
  ultimaMensagemEm: string | null;
  conectado: boolean;
}

export interface InicialCasaAoVivo {
  resumo: ResumoCasa | null;
  mercado: MercadoPublico[];
  coleta: Record<string, EventoColeta>;
}

/** Assina o topic privado "casa": resumo do dia, cotações e saúde dos coletores. */
export function useCasaAoVivo(inicial: InicialCasaAoVivo): EstadoCasaAoVivo {
  const [estado, setEstado] = useState<EstadoCasaAoVivo>({
    resumo: inicial.resumo,
    mercado: inicial.mercado,
    coleta: inicial.coleta,
    ultimaMensagemEm: null,
    conectado: false,
  });

  useEffect(() => {
    let sb: ReturnType<typeof supabaseBrowser>;
    try {
      sb = supabaseBrowser();
    } catch (e) {
      console.warn("[realtime] sem configuração do Supabase no cliente", e);
      return;
    }

    const marcar = () => new Date().toISOString();
    const canal = sb.channel("casa", { config: { private: true } });

    canal
      .on("broadcast", { event: "resumo" }, ({ payload }) => {
        const resumo = payload as ResumoCasa;
        setEstado((s) => {
          // O resumo sai de broadcast_posicao na hora em que uma entrada abre, fecha ou passa do atraso; o
          // evento "coleta" é throttled a 30 s por robô e conta ANTES da sincronização do próprio heartbeat
          // (o trigger de coleta_status dispara no passo 1 de atualizar_heartbeat). Como a home lê posicionado
          // e n_posicoes_abertas do mapa de coleta (abertasDaCasa, GradeRobos), o que o resumo diz entra nele:
          // último a chegar manda. Sem isso, depois de um fechamento a barra ficava "0 robôs posicionados ·
          // 1 operação em aberto" por até 30 s (21/09/2026). Robô que a coleta não conhece não ganha entrada:
          // sem heartbeat conhecido ele fica em 0 de qualquer jeito.
          const coleta = { ...s.coleta };
          for (const r of resumo.robos ?? []) {
            const c = coleta[r.slug];
            if (!c) continue;
            coleta[r.slug] = {
              ...c,
              posicionado: r.posicionado,
              n_posicoes_abertas: r.n_posicoes_abertas ?? c.n_posicoes_abertas,
            };
          }
          return { ...s, resumo, coleta, ultimaMensagemEm: marcar() };
        });
      })
      .on("broadcast", { event: "cotacao" }, ({ payload }) => {
        const { mercado } = payload as EventoCotacao;
        setEstado((s) => ({ ...s, mercado: mercado ?? s.mercado, ultimaMensagemEm: marcar() }));
      })
      .on("broadcast", { event: "coleta" }, ({ payload }) => {
        const c = payload as EventoColeta;
        setEstado((s) => ({
          ...s,
          coleta: { ...s.coleta, [c.slug]: c },
          ultimaMensagemEm: marcar(),
        }));
      })
      .subscribe((status) => {
        setEstado((s) => ({ ...s, conectado: status === "SUBSCRIBED" }));
        if (status === "SUBSCRIBED") void ressincronizar();
      });

    // Ao (re)conectar, busca o estado atual pra cobrir o intervalo entre o
    // render em cache do servidor e a assinatura.
    async function ressincronizar() {
      try {
        const [resumo, mercado, robos] = await Promise.all([
          sb.rpc("resumo_casa_hoje"),
          sb.from("mercado_publico").select("*"),
          // "*" e não a lista de colunas (21/09/2026): a view pública é pequena e só tem dado público, e
          // assim n_posicoes_abertas entra quando a migration 0020 for aplicada, sem um 400 antes dela
          // derrubar a ressincronização do heartbeat inteira
          sb.from("robos_publico").select("*"),
        ]);
        setEstado((s) => {
          const coleta = { ...s.coleta };
          for (const r of (robos.data ?? []) as Array<
            Pick<RoboPublico, "slug" | "ultimo_heartbeat_em" | "posicionado" | "n_posicoes_abertas">
          >) {
            coleta[r.slug] = {
              slug: r.slug,
              ultimo_heartbeat_em: r.ultimo_heartbeat_em,
              posicionado: r.posicionado,
              n_posicoes_abertas: r.n_posicoes_abertas ?? undefined,
            };
          }
          return {
            ...s,
            resumo: (resumo.data as ResumoCasa | null) ?? s.resumo,
            mercado: mercado.data ? (mercado.data as MercadoPublico[]) : s.mercado,
            coleta,
          };
        });
      } catch (e) {
        console.warn("[realtime] falha ao ressincronizar casa", e);
      }
    }

    return () => {
      void sb.removeChannel(canal);
    };
  }, []);

  return estado;
}
