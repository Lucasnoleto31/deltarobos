import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import {
  ROTULO_STATUS,
  TOM_STATUS,
  type StatusAoVivo,
  type TomStatus,
} from "@/lib/stats/status-robo";

const CLASSES: Record<TomStatus, string> = {
  positivo: "bg-positivo/15 text-positivo",
  negativo: "bg-negativo/15 text-negativo",
  neutro: "bg-muted text-muted-foreground",
  alerta: "bg-alerta/15 text-alerta",
  info: "bg-info/15 text-info",
};

export function BadgeStatusRobo({
  status,
  className,
}: {
  status: StatusAoVivo;
  className?: string;
}) {
  const pulsa = status === "operando" || status === "posicionado";
  return (
    <Badge variant="secondary" className={cn(CLASSES[TOM_STATUS[status]], className)}>
      {pulsa ? <span className="size-1.5 rounded-full bg-current animate-pulse" aria-hidden /> : null}
      {ROTULO_STATUS[status]}
    </Badge>
  );
}
