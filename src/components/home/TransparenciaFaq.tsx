import Link from "next/link";
import { Faq } from "@/components/compartilhados/Faq";
import { buttonVariants } from "@/components/ui/button";

/**
 * Item 14 da home: transparência e FAQ. As perguntas são as mesmas da página do robô e da metodologia.
 * O aviso legal fica só no rodapé, logo abaixo (aparecia duas vezes na mesma tela até 18/09/2026).
 */
export function TransparenciaFaq() {
  return (
    <section id="transparencia" className="conteudo scroll-mt-20 py-8">
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Transparência</h2>
          <p className="text-muted-foreground">
            Toda métrica do site tem uma definição pública e pode ser refeita à mão a partir da lista de operações.
          </p>
          <Link href="/metodologia" className={buttonVariants({ variant: "outline" })}>
            Ler a metodologia
          </Link>
        </div>

        <Faq />
      </div>
    </section>
  );
}
