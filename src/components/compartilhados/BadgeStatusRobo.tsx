import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { formatarNumero } from "@/lib/formato";
import { rotuloOperacoesEmAberto } from "@/lib/stats/posicoes";
import { LIMITE_SEM_HEARTBEAT_SEG } from "@/lib/stats/pregao";
import {
  ROTULO_STATUS,
  TOM_STATUS,
  type StatusAoVivo,
  type TomStatus,
} from "@/lib/stats/status-robo";

// Pílula colorida pelo estado (18/09/2026 à noite, Artur: "na pílula de aviso pode ser colorido"): fundo
// tingido e texto na cor, sem bolinha e sem pulso. Operando no verde do resultado, posicionado no verde
// da Quants (o acento, um dos poucos detalhes nele, desde 19/09/2026; antes dourado), pausado laranja,
// sem atualização vermelho, o resto cinza.
// 19/09/2026: onde a cor pura sobre o próprio tingido não chegava a 4,5:1 (ou ficava no limite), o texto
// leva 20% da cor do texto da página. Medido: Posicionado no claro 4,1:1 → 5,3:1 (com o verde #007A41:
// 5,3:1 sobre o papel, 5,6:1 no cartão), Sem atualização no vidro escuro 3,9:1 → 4,9:1, Pausado no claro
// 4,4:1 → 5,7:1, cinza no claro 4,6:1 → 6,0:1. No escuro o acento (o neon a 9,7:1 no tingido sobre o
// cartão), o verde, o laranja e o cinza ficam puros (passam); no claro o vermelho fica puro (4,8:1).
const CLASSES: Record<TomStatus, string> = {
  positivo: "border-positivo/30 bg-positivo/15 text-[color-mix(in_srgb,var(--positivo)_80%,var(--foreground))] dark:text-positivo",
  negativo: "border-negativo/30 bg-negativo/15 text-negativo dark:text-[color-mix(in_srgb,var(--negativo)_80%,var(--foreground))]",
  neutro: "border-(--painel-fio) bg-muted text-[color-mix(in_srgb,var(--muted-foreground)_80%,var(--foreground))] dark:text-muted-foreground",
  alerta: "border-alerta/30 bg-alerta/15 text-[color-mix(in_srgb,var(--alerta)_80%,var(--foreground))] dark:text-alerta",
  info: "border-info/30 bg-info/15 text-[color-mix(in_srgb,var(--info)_80%,var(--foreground))] dark:text-info",
};

// O que cada selo quer dizer, tirado da ordem de statusAoVivo (cadastro > sem coletor > pregão fechado >
// coletor parado > posicionado > horário do robô). Vai no title e, para leitor de tela, no próprio selo.
// 19/09/2026: com explicar={false} fica só o title; o cartão da home, que é um link inteiro, levava a
// definição no nome acessível.
const MINUTOS_SEM_SINAL = formatarNumero(LIMITE_SEM_HEARTBEAT_SEG / 60);
const DEFINICAO_STATUS: Record<StatusAoVivo, string> = {
  operando: "Pregão aberto, dentro do horário do robô e sem posição aberta.",
  posicionado: "Com posição aberta agora.",
  fora_do_horario: "Fora do pregão ou do horário do robô.",
  pausado: "Robô pausado. O histórico continua disponível.",
  em_breve: "Ainda não começou a operar em conta real.",
  arquivado: "Robô arquivado. O histórico continua disponível para consulta.",
  desconhecido: `O coletor no MetaTrader 5 está sem mandar sinal há mais de ${MINUTOS_SEM_SINAL} min com o pregão aberto.`,
  historico: "Sem coletor no MetaTrader 5: só o histórico importado.",
};

export function BadgeStatusRobo({
  status,
  abertas,
  explicar = true,
  className,
}: {
  status: StatusAoVivo;
  /**
   * operações em aberto do robô (entradas ainda abertas, nunca contratos; 21/09/2026). Só aparece com o selo
   * Posicionado, que já passou pelo gating de statusAoVivo (cadastro ativo, coletor, pregão aberto, sinal em
   * dia): "Posicionado · 3 em aberto". A unidade curta vai no visível: um "· 3" solto ao lado de um robô de
   * mini índice se lê como contratos, e o title não existe no toque. Zero ou ausente não muda nada.
   */
  abertas?: number;
  /** põe a definição no selo para leitor de tela (padrão sim); o title vai sempre */
  explicar?: boolean;
  className?: string;
}) {
  const definicao = DEFINICAO_STATUS[status];
  const rotuloAbertas = status === "posicionado" && abertas ? rotuloOperacoesEmAberto(abertas) : null;
  return (
    <Badge
      variant="outline"
      title={rotuloAbertas ? `${definicao} ${rotuloAbertas}.` : definicao}
      className={cn(CLASSES[TOM_STATUS[status]], className)}
    >
      {ROTULO_STATUS[status]}
      {rotuloAbertas ? (
        <>
          {/* o "· 3 em aberto" é só visual; o leitor de tela ouve o rótulo inteiro. O gap-1 do Badge separa do texto */}
          <span aria-hidden className="tabular-nums">
            · {formatarNumero(abertas ?? 0)} em aberto
          </span>
          <span className="sr-only">, {rotuloAbertas}</span>
        </>
      ) : null}
      {explicar ? <span className="sr-only">. {definicao}</span> : null}
    </Badge>
  );
}
