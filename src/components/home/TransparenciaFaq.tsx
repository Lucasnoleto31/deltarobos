import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { Textos } from "@/lib/tipos";

interface Props {
  textos: Textos;
}

const PERGUNTAS = [
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

/** Item 14 da home: transparência, FAQ e disclaimer. */
export function TransparenciaFaq({ textos }: Props) {
  return (
    <section id="transparencia" className="conteudo scroll-mt-20 py-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Transparência</h2>
          <p className="text-muted-foreground">
            Toda métrica do site tem uma definição pública e pode ser refeita à mão a partir da lista de operações.
          </p>
          <Link href="/metodologia" className={buttonVariants({ variant: "outline" })}>
            Ler a metodologia
          </Link>
          <p className="pt-4 text-xs text-muted-foreground">{textos.disclaimer}</p>
        </div>

        <dl className="divide-y rounded-2xl bg-card ring-1 ring-foreground/10">
          {PERGUNTAS.map((item) => (
            <details key={item.p} className="group px-5 py-3">
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
      </div>
    </section>
  );
}
