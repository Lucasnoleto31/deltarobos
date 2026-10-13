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
 * Em 19/09/2026 saiu a frase que explicava o botão: fica o título e o botão.
 * 13/10/2026 (mídia kit da Zeve): o cartão leva a cor do robô no fio e na barra ao lado do título, como o
 * cabeçalho da página (a --cor-robo vem do <article> do layout); o botão é o principal, no acento.
 */
export function Disclaimer({ nomeRobo, linkCta }: Props) {
  return (
    <section aria-labelledby="licenca">
      <div className="painel flex flex-wrap items-center justify-between gap-4 border-[color-mix(in_srgb,var(--cor-robo)_35%,transparent)] p-5 sm:p-6">
        <h2 id="licenca" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <span aria-hidden className="h-[0.9em] w-1 shrink-0 rounded-full bg-(--cor-robo)" />
          Licença do {nomeRobo}
        </h2>
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
