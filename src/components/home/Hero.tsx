import { buttonVariants } from "@/components/ui/button";
import type { Links, Textos } from "@/lib/tipos";
import { NumeroHero } from "./NumeroHero";
import type { UltimoPregaoCasa } from "./tipos";

interface Props {
  textos: Textos;
  links: Links;
  /** mostrado no número grande quando o pregão está fechado e ninguém operou hoje */
  ultimoPregao: UltimoPregaoCasa | null;
}

/**
 * Item 2 da home: frase curta, número grande do dia e o botão da comunidade. O "Ver os robôs" saiu
 * em 17/09/2026 (Artur: "que botão redundante, já estou na página de robôs"): os robôs são a seção
 * logo abaixo, na mesma página. Pelo mesmo motivo, sem link do WhatsApp não há botão nenhum, em vez
 * de um que só rola a página até a seção Comunidade. O rótulo diz para onde o botão leva.
 */
export function Hero({ textos, links, ultimoPregao }: Props) {
  return (
    <section className="conteudo grid gap-8 py-10 sm:py-14 lg:grid-cols-[1.2fr_1fr] lg:items-center">
      <div className="space-y-5">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          {textos.hero_titulo}
        </h1>
        <p className="max-w-prose text-pretty text-base text-muted-foreground sm:text-lg">
          {textos.hero_subtitulo}
        </p>
        {links.whatsapp ? (
          <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "lg" })}>
            Entrar no grupo do WhatsApp
          </a>
        ) : null}
      </div>

      <NumeroHero ultimoPregao={ultimoPregao} />
    </section>
  );
}
