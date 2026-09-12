import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { Links, Textos } from "@/lib/tipos";
import { NumeroHero } from "./NumeroHero";

interface Props {
  textos: Textos;
  links: Links;
}

/** Item 2 da home: frase curta, número grande do dia e os dois botões. */
export function Hero({ textos, links }: Props) {
  return (
    <section className="conteudo grid gap-8 py-10 sm:py-14 lg:grid-cols-[1.2fr_1fr] lg:items-center">
      <div className="space-y-5">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          {textos.hero_titulo}
        </h1>
        <p className="max-w-prose text-pretty text-base text-muted-foreground sm:text-lg">
          {textos.hero_subtitulo}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/#robos" className={buttonVariants({ size: "lg" })}>
            Ver os robôs
          </Link>
          {links.whatsapp ? (
            <a
              href={links.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              Entrar na comunidade
            </a>
          ) : (
            <Link href="/#comunidade" className={buttonVariants({ size: "lg", variant: "outline" })}>
              Entrar na comunidade
            </Link>
          )}
        </div>
      </div>

      <NumeroHero />
    </section>
  );
}
