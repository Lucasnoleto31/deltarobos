"use client";

import { useEffect, useRef } from "react";
import { useRoboAoVivo, type EstadoRoboAoVivo, type InicialRoboAoVivo } from "@/hooks/useRoboAoVivo";

interface Props {
  slug: string;
  inicial: InicialRoboAoVivo;
  aoMudar: (estado: EstadoRoboAoVivo) => void;
}

/**
 * Roda o hook do realtime e devolve o estado ao RoboAoVivoProvider. Carregado
 * só no navegador, depois da hidratação, para o cliente do Supabase sair do
 * primeiro carregamento (18/09/2026). Não desenha nada.
 */
export function AssinanteRobo({ slug, inicial, aoMudar }: Props) {
  const estado = useRoboAoVivo(slug, inicial);
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
