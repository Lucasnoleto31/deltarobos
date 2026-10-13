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
 * 13/10/2026: destaque de estado no laranja do alerta, com o fundo tingido. No claro o texto leva 20% da cor
 * do texto da página, como o selo de estado: o laranja puro sobre o tingido dava 4,1:1; misturado, 5,5:1.
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
        "rounded-lg border border-alerta/40 bg-alerta/10 px-3 py-2 text-sm text-[color-mix(in_srgb,var(--alerta)_80%,var(--foreground))] dark:text-alerta",
        className,
      )}
    >
      <p>
        <strong className="font-medium">Sem atualização {haQuanto(ultimoHeartbeatEm, agora)}.</strong>{" "}
        O coletor do MetaTrader pode estar parado. Os dados abaixo podem estar defasados.
      </p>
    </div>
  );
}
