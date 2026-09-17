import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

interface Props {
  nomeRobo: string;
  texto: string;
  linkCta: string;
}

/**
 * CTA "quero esse robô" (spec §8.2). O aviso legal deixou de ser repetido aqui em 17/09/2026: o rodapé,
 * logo abaixo, traz o mesmo texto em toda página. A prop `texto` fica para não mexer em quem chama.
 */
export function Disclaimer({ nomeRobo, linkCta }: Props) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 painel p-5 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Quer o {nomeRobo} rodando na sua conta?</h2>
          <p className="text-sm text-muted-foreground">
            Fale com a equipe da Delta Robôs e libere a licença em poucos passos.
          </p>
        </div>
        {linkCta ? (
          <a
            href={linkCta}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: "lg" })}
          >
            Quero esse robô
          </a>
        ) : (
          <Link href="/#como-comecar" className={buttonVariants({ size: "lg" })}>
            Quero esse robô
          </Link>
        )}
      </div>
    </section>
  );
}
