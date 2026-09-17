import { cn } from "cn";

export interface PerguntaFaq {
  p: string;
  r: string;
}

/**
 * As perguntas comuns do site. Moravam só na home; desde 17/09/2026 são as mesmas na home, na
 * página de cada robô e na metodologia, para a explicação sair de cima dos números e ficar num
 * lugar só, fechada até alguém querer ler.
 */
export const PERGUNTAS_FREQUENTES: PerguntaFaq[] = [
  {
    p: "De onde vêm os números?",
    r: "De um coletor que roda dentro do MetaTrader 5 das contas da Delta Robôs e envia cada operação assim que ela fecha. Nenhum número é digitado à mão.",
  },
  {
    p: "O que significa \"por contrato\"?",
    r: "Todo resultado é dividido pela quantidade de contratos da operação. Se você opera 3 contratos, multiplique por 3.",
  },
  {
    p: "Os custos estão descontados?",
    r: "Sim, por padrão. Cada robô tem um custo fixo por contrato por operação (corretagem e emolumentos), mostrado na seção Transparência. Dá pra ver o bruto com um toggle.",
  },
  {
    p: "O resultado vai bater com o meu extrato?",
    r: "Os pontos sim. O valor em reais depende dos seus custos e da sua corretora, por isso o site mostra um custo de referência e deixa o bruto visível.",
  },
  {
    p: "Com que frequência atualiza?",
    r: "Operação fechada aparece em até 5 segundos. Se o coletor parar por mais de 2 minutos em horário de pregão, o site avisa em vez de mostrar dado velho.",
  },
  {
    p: "De qual conta vêm as estatísticas?",
    r: "Cada robô tem uma conta principal da Delta Robôs que alimenta os números públicos. Quando ela é uma conta demo, o robô mostra um selo indicando isso.",
  },
];

interface Props {
  perguntas?: PerguntaFaq[];
  className?: string;
}

/** Lista agrupada de perguntas que abrem no lugar (details), com separador encaixado. */
export function Faq({ perguntas = PERGUNTAS_FREQUENTES, className }: Props) {
  return (
    <dl className={cn("painel overflow-hidden", className)}>
      {perguntas.map((item) => (
        <details key={item.p} className="sep [--sep:20px] group px-5 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <dt>{item.p}</dt>
            <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <dd className="pt-2 text-sm text-muted-foreground">{item.r}</dd>
        </details>
      ))}
    </dl>
  );
}
