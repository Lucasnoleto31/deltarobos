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
 * Banner "sem atualização há X min" quando o coletor para em horário de
 * pregão (spec §5). Nunca mostrar dado velho parecendo vivo.
 */
export function AvisoSemAtualizacao({ ultimoHeartbeatEm, pregao, feriados, className }: Props) {
  const agora = useAgora(5000);
  if (!agora) return null;

  const aberto = pregaoAberto(agora, pregao, feriados);
  if (!coletaParada(ultimoHeartbeatEm, agora, aberto)) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-alerta/40 bg-alerta/10 px-3 py-2 text-sm text-alerta",
        className,
      )}
    >
      <span className="mt-1.5 inline-block size-2 shrink-0 rounded-full bg-alerta" aria-hidden />
      <p>
        <strong className="font-medium">Sem atualização {haQuanto(ultimoHeartbeatEm, agora)}.</strong>{" "}
        O coletor do MetaTrader pode estar parado. Os dados abaixo podem estar defasados.
      </p>
    </div>
  );
}
