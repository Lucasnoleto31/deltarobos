"use client";

import { cn } from "cn";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { useAgora } from "@/hooks/useAgora";
import { abertasAoVivo, rotuloOperacoesEmAberto, totalAbertas } from "@/lib/stats/posicoes";
import { usePregaoAberto, useRobo } from "./RoboAoVivoProvider";

interface Props {
  /** com o i do glossário (padrão sim); a tela Ao vivo, feita para print, vai sem */
  comInfo?: boolean;
  className?: string;
}

/**
 * "3 operações em aberto" do robô (21/09/2026): cada entrada ainda aberta na conta principal conta 1, somando
 * o n_abertas dos grupos da view (nunca volume). Segue o gating do selo Posicionado: robô fora do cadastro
 * ativo ou sem coletor não tem; fora do pregão ou com o coletor parado (spec §5) some, e quem fala é o
 * aviso "sem atualização" do cabeçalho; sem relógio (HTML do servidor e hidratação) também não aparece,
 * como o AvisoSemAtualizacao e o selo: antes o HTML chegava com o número ao lado de um selo "Fora do
 * horário". Relógio próprio de 5 s, como o AvisoSemAtualizacao, para o painel Hoje continuar sem relógio:
 * só esta linha renderiza de novo a cada volta.
 */
export function OperacoesEmAberto({ comInfo = true, className }: Props) {
  const { estado, robo } = useRobo();
  const aberto = usePregaoAberto();
  const agora = useAgora(5000);

  if (robo.status !== "ativo" || !robo.tem_coletor) return null;
  const n = abertasAoVivo(totalAbertas(estado.posicoes), estado.ultimoHeartbeatEm, agora, aberto);
  const rotulo = rotuloOperacoesEmAberto(n);
  if (!rotulo) return null;

  return (
    <p className={cn("tabular-nums", className)}>
      {comInfo ? <RotuloComInfo chave="operacoesEmAberto">{rotulo}</RotuloComInfo> : rotulo}
    </p>
  );
}
