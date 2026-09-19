import Link from "next/link";
import { Simbolo } from "@/components/marca/Simbolo";
import type { Links } from "@/lib/tipos";
import { AbasRobos } from "./AbasRobos";
import { AlternadorTema } from "./AlternadorTema";
import { BotaoGrupo } from "./BotaoGrupo";
import { LinksNav } from "./LinksNav";

interface Props {
  links: Links;
  /** os robôs das abas, sem os arquivados; o layout busca uma vez e passa o mesmo ao rodapé */
  robos: { slug: string; nome: string }[];
}

/**
 * Cabeçalho no desenho das plataformas de trading que o Artur mandou em 18/09/2026: marca à esquerda;
 * no meio, os robôs como abas de instrumento (pílulas, a atual em branco) e depois os outros links;
 * à direita, o tema e a pílula "Entrar no grupo" (fora da home). O menu suspenso de robôs que ficou
 * uma tarde no ar saiu ("essa opção da nav bar não está legal"). No celular a navegação desce para uma
 * segunda linha e rola de lado, com as pontas esmaecendo; desde 19/09/2026 os links de texto vêm junto,
 * depois dos robôs (antes sumiam no celular e Comparativo e Metodologia ficavam sem caminho).
 * O -ml-1/px-1/-my-1/py-1 da faixa dá espaço ao anel de foco sem mexer no alinhamento: a rolagem
 * corta o que passa da borda.
 */
export function Cabecalho({ links, robos }: Props) {
  return (
    <header className="sticky top-0 z-40 barra-vidro">
      <div className="conteudo flex flex-wrap items-center gap-x-4 gap-y-2 py-2 lg:h-14 lg:flex-nowrap lg:py-0">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <Simbolo aria-hidden className="h-7 w-auto" />
          <span>
            Quants <span className="text-muted-foreground">Robôs</span>
          </span>
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:order-3">
          <AlternadorTema />
          {links.whatsapp ? <BotaoGrupo href={links.whatsapp} /> : null}
        </div>

        <nav
          aria-label="Principal"
          className="borda-esmaece -my-1 -ml-1 flex basis-full items-center gap-3 overflow-x-auto px-1 py-1 text-sm [scrollbar-width:none] lg:order-2 lg:mx-auto lg:basis-auto [&::-webkit-scrollbar]:hidden"
        >
          <AbasRobos robos={robos} />
          <span aria-hidden className="h-4 w-px shrink-0 bg-(--painel-fio-forte)" />
          <LinksNav />
        </nav>
      </div>
    </header>
  );
}
