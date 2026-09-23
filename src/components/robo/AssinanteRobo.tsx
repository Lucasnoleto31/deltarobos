"use client";

import { useEffect, useRef } from "react";
import { useRoboAoVivo, type EstadoRoboAoVivo, type InicialRoboAoVivo } from "@/hooks/useRoboAoVivo";

interface Props {
  slug: string;
  inicial: InicialRoboAoVivo;
  aoMudar: (estado: EstadoRoboAoVivo) => void;
  /** o pregão está aberto agora (23/09/2026): o vigia da série do saldo só relê a rota com ele aberto */
  pregaoAberto: boolean;
  /** o robô tem coletor (robos.tem_coletor): sem ele não há série do saldo a pedir à rota (revisão de 23/09/2026) */
  temColetor: boolean;
}

/**
 * Roda o hook do realtime e devolve o estado ao RoboAoVivoProvider. Carregado
 * só no navegador, depois da hidratação, para o cliente do Supabase sair do
 * primeiro carregamento (18/09/2026). Não desenha nada.
 */
export function AssinanteRobo({ slug, inicial, aoMudar, pregaoAberto, temColetor }: Props) {
  const estado = useRoboAoVivo(slug, inicial, { pregaoAberto, temColetor });
  // O primeiro estado do hook é igual ao que o provider já tem: não repassa,
  // para não re-renderizar a página à toa logo depois da hidratação.
  const primeiro = useRef(true);
  useEffect(() => {
    if (primeiro.current) {
      primeiro.current = false;
      return;
    }
    aoMudar(estado);
  }, [estado, aoMudar]);
  return null;
}
