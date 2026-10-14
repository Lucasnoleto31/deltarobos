import Link from "next/link";
import { Faq } from "@/components/compartilhados/Faq";
import { RevelarNaRolagem } from "@/components/compartilhados/RevelarNaRolagem";
import { buttonVariants } from "@/components/ui/button";
import { formatarNumero } from "@/lib/formato";

/**
 * Item 14 da home: transparência e FAQ. As perguntas são as mesmas da página do robô e da metodologia.
 * O aviso legal fica só no rodapé, logo abaixo (aparecia duas vezes na mesma tela até 18/09/2026).
 */
export function TransparenciaFaq({ totalOperacoes }: { totalOperacoes: number }) {
  return (
    // o scroll-mt-20 saiu em 19/09/2026: quem desconta o cabeçalho é o scroll-padding-top do html
    <section id="transparencia" className="conteudo py-8">
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.4fr]">
        {/* as duas colunas entram separadas, a do FAQ um pouco depois: no computador elas ficam lado a
            lado e a diferença lê como uma coisa só chegando da esquerda (19/09/2026) */}
        <RevelarNaRolagem className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Transparência</h2>
          <p className="text-muted-foreground">
            {formatarNumero(totalOperacoes)} operações listadas uma a uma, com entrada, saída, horário e custo. Todo número
            do site sai delas.
          </p>
          <Link href="/metodologia" className={buttonVariants({ variant: "outline" })}>
            Ler a metodologia
          </Link>
        </RevelarNaRolagem>

        <RevelarNaRolagem atraso={90}>
          <Faq />
        </RevelarNaRolagem>
      </div>
    </section>
  );
}
