import Link from "next/link";
import { Simbolo } from "@/components/marca/Simbolo";
import { listarRobos } from "@/lib/consultas/publico";
import type { Links } from "@/lib/tipos";
import { AlternadorTema } from "./AlternadorTema";
import { BotaoGrupo } from "./BotaoGrupo";
import { LinksNav } from "./LinksNav";
import { MenuRobos } from "./MenuRobos";

interface Props {
  links: Links;
}

/**
 * Cabeçalho em três partes, como nas páginas de trading que o Artur mostrou em 18/09/2026: marca à
 * esquerda, navegação no centro e, à direita, o tema e um botão em pílula para o grupo (fora da home). "Robôs" é um
 * menu com cada robô (atalho para o detalhe de qualquer um), e aparece no celular também; os outros
 * links ficam para o computador.
 */
export async function Cabecalho({ links }: Props) {
  const robos = (await listarRobos())
    .filter((r) => r.status !== "arquivado")
    .map((r) => ({ slug: r.slug, nome: r.nome, ativo: r.ativo }));

  return (
    <header className="sticky top-0 z-40 barra-vidro">
      <div className="conteudo relative flex h-14 items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Simbolo aria-hidden className="h-7 w-auto" />
          <span>
            Delta <span className="text-muted-foreground">Robôs</span>
          </span>
        </Link>

        <nav
          aria-label="Principal"
          className="flex items-center gap-0.5 text-sm lg:absolute lg:left-1/2 lg:-translate-x-1/2"
        >
          <MenuRobos robos={robos} />
          <LinksNav />
        </nav>

        <div className="flex items-center gap-1.5">
          <AlternadorTema />
          {links.whatsapp ? <BotaoGrupo href={links.whatsapp} /> : null}
        </div>
      </div>
    </header>
  );
}
