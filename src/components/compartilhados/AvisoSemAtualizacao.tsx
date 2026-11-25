"use client";

import { cn } from "cn";
import { useAgora } from "@/hooks/useAgora";
import { haQuanto } from "@/lib/formato";
import { coletaParada, pregaoAberto, type HorarioPregao } from "@/lib/stats/pregao";

interface Props {
  ultimoHeartbeatEm: string | null;
  pregao: HorarioPregao;
  feriados: string[];
  className?: string;
}

/**
 * Aviso "sem atualização há X min" quando o coletor para em horário de pregão (spec §5). Nunca mostrar dado
 * velho parecendo vivo. Desde a ficha Mesa (25/11/2026) é uma linha de texto na cor de atenção, sem caixa.
 */
export function AvisoSemAtualizacao({ ultimoHeartbeatEm, pregao, feriados, className }: Props) {
  const agora = useAgora(5000);
  if (!agora) return null;

  const aberto = pregaoAberto(agora, pregao, feriados);
  if (!coletaParada(ultimoHeartbeatEm, agora, aberto)) return null;

  return (
    <p role="status" className={cn("max-w-3xl text-sm text-pretty text-alerta", className)}>
      <strong className="font-medium">Sem atualização {haQuanto(ultimoHeartbeatEm, agora)}.</strong> O coletor do MetaTrader pode estar
      parado. Os dados abaixo podem estar defasados.
    </p>
  );
}
