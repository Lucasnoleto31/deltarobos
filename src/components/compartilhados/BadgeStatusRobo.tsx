import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import {
  ROTULO_STATUS,
  TOM_STATUS,
  type StatusAoVivo,
  type TomStatus,
} from "@/lib/stats/status-robo";

// Só o fio e a cor do texto: sem fundo tingido, sem bolinha e sem pulso (18/09/2026, "remova tudo
// que parece i.a"). O que diz o estado é a palavra; a cor só a reforça.
const CLASSES: Record<TomStatus, string> = {
  positivo: "border-positivo/50 text-positivo",
  negativo: "border-negativo/50 text-negativo",
  neutro: "border-border text-muted-foreground",
  alerta: "border-alerta/50 text-alerta",
  info: "border-(--painel-fio-forte) text-foreground",
};

export function BadgeStatusRobo({
  status,
  className,
}: {
  status: StatusAoVivo;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(CLASSES[TOM_STATUS[status]], className)}>
      {ROTULO_STATUS[status]}
    </Badge>
  );
}
