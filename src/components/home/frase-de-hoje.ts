import type { StatusAoVivo } from "@/lib/stats/status-robo";

/** O que a frase precisa saber do robô agora. */
export interface RoboAgora {
  statusAoVivo: StatusAoVivo;
  operouHoje: boolean;
  /** resultado de hoje (R$, 1 contrato, já com custos) */
  hoje: number;
  hojeOperacoes?: number;
  /** último dia com dado, para o robô sem acompanhamento ao vivo ("YYYY-MM-DD") */
  dadosAte?: string | null;
}

/** A frase em três pedaços, para quem desenha pintar só o valor: `antes` + valor + `depois`. */
export interface FraseDeHoje {
  antes: string;
  valor: number | null;
  depois: string;
  tom: "neutro" | "info" | "alerta";
}

const curta = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/**
 * O que o robô fez hoje, em palavras de quem não é do mercado (25/11/2026). Entra no lugar dos selos "No
 * horário", "Posicionado" e "Histórico", que não dizem nada a um iniciante: "hoje +R$ 240 em 3 operações",
 * "hoje ainda sem operação", "em operação agora", "sem acompanhamento ao vivo · dados até 24/11".
 *
 * Não promete o que o site não sabe: com o pregão aberto e o robô no horário, a frase diz só que hoje ainda
 * não houve operação; se ele está ligado ou não, só a conta sabe.
 */
export function fraseDeHoje(r: RoboAgora): FraseDeHoje {
  const n = r.hojeOperacoes ?? 0;
  const operacoes = n > 0 ? ` em ${n.toLocaleString("pt-BR")} ${n === 1 ? "operação" : "operações"}` : "";

  switch (r.statusAoVivo) {
    case "em_breve":
      return { antes: "em breve", valor: null, depois: "", tom: "neutro" };
    case "pausado":
      return { antes: "pausado", valor: null, depois: "", tom: "alerta" };
    case "arquivado":
      return { antes: "arquivado", valor: null, depois: "", tom: "neutro" };
    case "historico":
      return {
        antes: `sem acompanhamento ao vivo${r.dadosAte ? ` · dados até ${curta(r.dadosAte)}` : ""}`,
        valor: null,
        depois: "",
        tom: "neutro",
      };
    case "desconhecido":
      return { antes: "sem atualização no momento", valor: null, depois: "", tom: "alerta" };
    case "posicionado":
      return r.operouHoje
        ? { antes: "em operação agora · hoje ", valor: r.hoje, depois: "", tom: "info" }
        : { antes: "em operação agora", valor: null, depois: "", tom: "info" };
    case "operando":
      return r.operouHoje
        ? { antes: "hoje ", valor: r.hoje, depois: operacoes, tom: "neutro" }
        : { antes: "hoje ainda sem operação", valor: null, depois: "", tom: "neutro" };
    case "fora_do_horario":
    default:
      return r.operouHoje
        ? { antes: "hoje ", valor: r.hoje, depois: operacoes, tom: "neutro" }
        : { antes: "sem operação hoje", valor: null, depois: "", tom: "neutro" };
  }
}
