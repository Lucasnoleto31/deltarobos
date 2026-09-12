"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/cliente";
import type { EventoColeta, EventoCotacao, MercadoPublico, ResumoCasa } from "@/lib/tipos";

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
        setEstado((s) => ({ ...s, resumo: payload as ResumoCasa, ultimaMensagemEm: marcar() }));
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
          sb.from("robos_publico").select("slug, ultimo_heartbeat_em, posicionado"),
        ]);
        setEstado((s) => {
          const coleta = { ...s.coleta };
          for (const r of (robos.data ?? []) as Array<{
            slug: string;
            ultimo_heartbeat_em: string | null;
            posicionado: boolean;
          }>) {
            coleta[r.slug] = {
              slug: r.slug,
              ultimo_heartbeat_em: r.ultimo_heartbeat_em,
              posicionado: r.posicionado,
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
