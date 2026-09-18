import Link from "next/link";
import { Simbolo } from "@/components/marca/Simbolo";
import { listarRobos } from "@/lib/consultas/publico";
import type { Links } from "@/lib/tipos";
import { AbasRobos } from "./AbasRobos";
import { AlternadorTema } from "./AlternadorTema";
import { BotaoGrupo } from "./BotaoGrupo";
import { LinksNav } from "./LinksNav";

interface Props {
  links: Links;
}

/**
 * Cabeçalho no desenho das plataformas de trading que o Artur mandou em 18/09/2026: marca à esquerda;
 * no meio, os robôs como abas de instrumento (pílulas, a atual em branco) e depois os outros links;
 * à direita, o tema e a pílula "Entrar no grupo" (fora da home). O menu suspenso de robôs que ficou
 * uma tarde no ar saiu ("essa opção da nav bar não está legal"). No celular as abas dos robôs descem
 * para uma segunda linha e rolam de lado; os links de texto ficam para o computador (o rodapé os tem).
 */
export async function Cabecalho({ links }: Props) {
  const robos = (await listarRobos())
    .filter((r) => r.status !== "arquivado")
    .map((r) => ({ slug: r.slug, nome: r.nome }));

  return (
    <header className="sticky top-0 z-40 barra-vidro">
      <div className="conteudo flex flex-wrap items-center gap-x-4 gap-y-2 py-2 lg:h-14 lg:flex-nowrap lg:py-0">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <Simbolo aria-hidden className="h-7 w-auto" />
          <span>
            Delta <span className="text-muted-foreground">Robôs</span>
          </span>
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:order-3">
          <AlternadorTema />
          {links.whatsapp ? <BotaoGrupo href={links.whatsapp} /> : null}
        </div>

        <nav
          aria-label="Principal"
          className="flex basis-full items-center gap-3 overflow-x-auto text-sm [scrollbar-width:none] lg:order-2 lg:mx-auto lg:basis-auto [&::-webkit-scrollbar]:hidden"
        >
          <AbasRobos robos={robos} />
          <span aria-hidden className="hidden h-4 w-px shrink-0 bg-(--painel-fio-forte) sm:block" />
          <LinksNav />
        </nav>
      </div>
    </header>
  );
}
