import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import { formatarNumero } from "@/lib/formato";
import { LIMITE_SEM_HEARTBEAT_SEG } from "@/lib/stats/pregao";

export interface PerguntaFaq {
  p: string;
  r: string;
}

// o mesmo limite que decide o aviso "sem atualização" (lib/stats/pregao), para a resposta não descolar dele;
// é a mesma conta que a página Como funciona faz para o texto dela
const MINUTOS_SEM_SINAL = formatarNumero(LIMITE_SEM_HEARTBEAT_SEG / 60);

/**
 * As perguntas comuns do site, num lugar só e fechadas até alguém querer ler (17/09/2026: a explicação saiu
 * de cima dos números). Desde a ficha Mesa (25/11/2026) moram no fim de Como funciona (/metodologia).
 *
 * 25/11/2026 (ficha Mesa, DESIGN.md seção 7; Lucas: "para um leigo está muito difícil de entender"): as
 * respostas citam a tela pelo nome que ela tem hoje e sem jargão.
 * - "por contrato" virou "com 1 contrato", a frase que acompanha os números, e a resposta diz o que é um
 *   contrato;
 * - o custo de cada robô era "mostrado na seção Transparência": a seção se chama "De onde vêm os números";
 * - "dá pra ver o bruto com um toggle": é a opção "Antes dos custos" da aba Desempenho;
 * - a conta demo tinha "um selo": é a linha "Conta: Demo" do cabeçalho do robô;
 * - "emolumentos" são "taxas da bolsa", e o aviso de coletor parado é o texto "sem atualização".
 * Robô sem custo cadastrado aparece antes dos custos (a página dele diz "não configurado"), e por isso a
 * resposta dos custos continua com "por padrão".
 */
export const PERGUNTAS_FREQUENTES: PerguntaFaq[] = [
  {
    p: "De onde vêm os números?",
    r: "De um coletor: um programa que roda dentro do MetaTrader 5 das contas da Quants Robôs. Ele não opera, só lê a conta e envia ao site cada operação assim que ela fecha. Nenhum número é digitado à mão.",
  },
  {
    p: "O que quer dizer “com 1 contrato”?",
    r: "Contrato é a unidade de negociação na bolsa: um robô pode operar 1, 2 ou mais de cada vez. Para todos ficarem na mesma régua, o site divide cada resultado pela quantidade de contratos da operação e mostra quanto daria com 1. Se você opera 3 contratos, multiplique por 3.",
  },
  {
    p: "Os custos estão descontados?",
    r: "Sim, por padrão. De cada operação sai um custo fixo por contrato (corretagem e taxas da bolsa). O valor de cada robô está na página dele, em “De onde vêm os números”; robô sem custo cadastrado aparece com os valores antes dos custos, e a página diz isso. Para ver os números sem o desconto, escolha “Antes dos custos” na aba Desempenho.",
  },
  {
    p: "O resultado vai bater com o meu extrato?",
    r: "Os pontos, sim. O valor em reais depende dos seus custos e da sua corretora. Por isso o site usa um custo de referência, mostrado na página de cada robô, e deixa ver os valores antes dos custos.",
  },
  {
    p: "Com que frequência atualiza?",
    r: `Uma operação fechada aparece em até 5 segundos. Se o coletor ficar mais de ${MINUTOS_SEM_SINAL} minutos sem mandar sinal com o pregão aberto, o site escreve “sem atualização” em vez de mostrar dado velho como se fosse ao vivo.`,
  },
  {
    p: "De qual conta vêm as estatísticas?",
    r: "Cada robô tem uma conta principal da Quants Robôs, que alimenta os números públicos. Quando ela é uma conta demo, o cabeçalho da página do robô traz “Conta: Demo”.",
  },
];

interface Props {
  perguntas?: PerguntaFaq[];
  className?: string;
}

/**
 * Lista agrupada de perguntas que abrem no lugar (details), com separador encaixado.
 * 19/09/2026: o respiro da linha mora no summary, que é o alvo do toque; antes ficava no details e os
 * 14px de cima e de baixo não abriam nada. A resposta mantém o mesmo recuo, com a seta livre à direita.
 * O anel de foco fica por dentro, com o canto do painel: encostado na borda, o painel o cortaria.
 */
export function Faq({ perguntas = PERGUNTAS_FREQUENTES, className }: Props) {
  return (
    // 25/11/2026 (Lucas: "muita cara de IA"): sem a caixa com borda e canto; cada pergunta é uma linha separada por fio.
    <dl className={cn("divide-y divide-(--painel-fio)", className)}>
      {perguntas.map((item) => (
        <details key={item.p} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 text-sm font-medium focus-visible:outline-offset-4 [&::-webkit-details-marker]:hidden">
            <dt>{item.p}</dt>
            <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <dd className="-mt-1 max-w-prose pr-8 pb-4 text-sm leading-relaxed text-muted-foreground">{item.r}</dd>
        </details>
      ))}
    </dl>
  );
}
