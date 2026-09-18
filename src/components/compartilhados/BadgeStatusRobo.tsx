import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import {
  ROTULO_STATUS,
  TOM_STATUS,
  type StatusAoVivo,
  type TomStatus,
} from "@/lib/stats/status-robo";

// Pílula colorida pelo estado (18/09/2026 à noite, Artur: "na pílula de aviso pode ser colorido"): fundo
// tingido e texto na cor, sem bolinha e sem pulso. Operando verde, posicionado dourado (um dos poucos
// detalhes em dourado), pausado laranja, sem atualização vermelho, o resto cinza.
const CLASSES: Record<TomStatus, string> = {
  positivo: "border-positivo/30 bg-positivo/15 text-positivo",
  negativo: "border-negativo/30 bg-negativo/15 text-negativo",
  neutro: "border-(--painel-fio) bg-muted text-muted-foreground",
  alerta: "border-alerta/30 bg-alerta/15 text-alerta",
  info: "border-info/30 bg-info/15 text-info",
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
