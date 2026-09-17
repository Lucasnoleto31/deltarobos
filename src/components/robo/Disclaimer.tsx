import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

interface Props {
  nomeRobo: string;
  texto: string;
  linkCta: string;
}

/** CTA "quero esse robô" + aviso legal (spec §8.2). */
export function Disclaimer({ nomeRobo, texto, linkCta }: Props) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 painel p-6">
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
      <p className="text-xs text-muted-foreground">{texto}</p>
    </section>
  );
}
