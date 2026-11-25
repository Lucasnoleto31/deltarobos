import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import { formatarNumero } from "@/lib/formato";
import { premissaDoRobo } from "@/lib/premissa";
import { LIMITE_SEM_HEARTBEAT_SEG } from "@/lib/stats/pregao";

export interface PerguntaFaq {
  p: string;
  r: string;
}

// o mesmo limite que decide o aviso "sem atualização" (lib/stats/pregao), para a resposta não descolar dele;
// é a mesma conta que a página Como funciona faz para o texto dela
const MINUTOS_SEM_SINAL = formatarNumero(LIMITE_SEM_HEARTBEAT_SEG / 60);

// a premissa que as telas escrevem junto do número do robô sem custo cadastrado, pela mesma regra delas
// (src/lib/premissa): custo zero é o caso desse robô
const PREMISSA_SEM_CUSTO = premissaDoRobo(0);

/**
 * As perguntas comuns do site, num lugar só e fechadas até alguém querer ler (17/09/2026: a explicação saiu
 * de cima dos números). Desde a ficha Mesa (25/11/2026) moram no fim de Como funciona (/metodologia).
 *
 * 25/11/2026, revisão das telas e dos indicadores (DESIGN.md, seção 9). As respostas seguem as mesmas regras
 * das telas e citam cada uma pelo nome que tem hoje:
 * - a premissa é "com 1 contrato por entrada": a resposta diz o que é contrato e por que "por entrada";
 * - não existem mais a opção "Antes dos custos", a aba Desempenho nem a aba Relatórios (os arquivos de cada
 *   mês estão em Dia a dia);
 * - entraram as perguntas de quem vai pôr o robô na própria conta: quanto preciso ter (o capital mínimo pela
 *   regra nova), se o resultado vai ser igual ao da minha conta, por que não há rendimento por mês e se
 *   acertar muito basta. Acertos nunca aparecem sem o necessário para empatar;
 * - o que o site não sabe (preço da licença, alíquota de imposto, se o robô estava ligado) não é inventado.
 * Nenhuma resposta leva número de robô nem de ativo: isso está nas telas, vindo do banco.
 * Os custos (revisão de 25/11/2026): a resposta não diz "sim" para todos os robôs. O robô sem custo cadastrado
 * aparece "antes dos custos", e a frase que a resposta cita sai de src/lib/premissa, a mesma das telas.
 */
export const PERGUNTAS_FREQUENTES: PerguntaFaq[] = [
  {
    p: "De onde vêm os números?",
    r: "De um coletor: um programa que roda dentro do MetaTrader 5 das contas da Quants Robôs. Ele não opera, só lê a conta e envia ao site cada operação assim que ela fecha. Nenhum número é digitado à mão.",
  },
  {
    p: "O que quer dizer “com 1 contrato por entrada”?",
    r: "Contrato é a unidade de negociação na bolsa. O site divide cada resultado pela quantidade de contratos da operação e mostra quanto daria com 1. O “por entrada” importa porque alguns robôs abrem uma entrada nova antes de fechar a anterior: com várias abertas, a conta carrega vários contratos ao mesmo tempo. O máximo que cada robô já teve está no Resumo dele.",
  },
  {
    p: "Quanto preciso ter na conta?",
    r: "O site calcula um capital mínimo para cada robô: a garantia que a corretora exige por contrato (a margem), vezes o máximo de entradas que ele já teve abertas ao mesmo tempo, mais a maior queda do histórico com uma folga de segurança. O valor aparece na lista da Visão geral e no Resumo de cada robô; a conta, parcela por parcela, está na aba Quedas e risco. Em Simular meu capital você confere com o seu valor.",
  },
  {
    p: "Os custos estão descontados?",
    r: `No robô que tem custo cadastrado, sim: de cada operação sai um custo fixo por contrato (corretagem e taxas da bolsa), mostrado na página dele. É um custo de referência, e o da sua corretora pode ser outro. O robô cujo histórico não tem custo aparece sem esse desconto, e a frase junto do número dele diz “${PREMISSA_SEM_CUSTO}”.`,
  },
  {
    p: "O resultado vai ser igual na minha conta?",
    r: "Não exatamente. Os números são os da conta da Quants Robôs, com 1 contrato por entrada e o custo de referência de cada robô, quando ele tem custo cadastrado. Na sua conta mudam o preço em que cada ordem sai e os custos da sua corretora, e ainda há o imposto de renda e a licença do robô, que não estão em nenhum número do site. E resultado passado não garante resultado futuro.",
  },
  {
    p: "Por que o site não mostra quanto o robô rende por mês?",
    r: "Porque o resultado não vem igual todo mês, e uma média esconde os meses de perda. No lugar dela o site mostra em quantos meses o robô terminou com ganho, qual foi o pior mês e, ao lado de todo resultado, a maior queda.",
  },
  {
    p: "Um robô que acerta quase sempre é melhor?",
    r: "Não necessariamente. Se cada perda for muito maior que cada ganho, é preciso acertar quase sempre só para empatar. Por isso os acertos aparecem sempre ao lado de quantos acertos o robô precisa para empatar: o que importa é a distância entre os dois.",
  },
  {
    p: "Com que frequência atualiza?",
    r: `Uma operação fechada aparece em até 5 segundos. Se o coletor ficar mais de ${MINUTOS_SEM_SINAL} minutos sem mandar sinal com o pregão aberto, o site escreve “sem atualização” em vez de mostrar dado velho como se fosse ao vivo.`,
  },
  {
    p: "O site sabe se o robô está ligado?",
    r: "Não. O site sabe se o pregão está aberto, se é horário do robô e se o coletor está mandando sinal. Por isso escreve “hoje ainda sem operação” ou “em operação agora”, e nunca “ligado”. Quando o robô passa um dia sem operar, o site mostra o dia sem operação e não inventa o motivo.",
  },
  {
    p: "De qual conta vêm as estatísticas?",
    r: "Cada robô tem uma conta principal da Quants Robôs, que alimenta os números públicos. Quando ela é uma conta demo, a página do robô diz isso junto dos dados dele.",
  },
  {
    p: "Onde estão os arquivos de cada mês?",
    r: "Na aba Dia a dia de cada robô, na lista “Mês a mês”: cada mês tem o relatório em PDF e a planilha com as operações. Os meses mais recentes também ficam no pé da aba Operações.",
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
