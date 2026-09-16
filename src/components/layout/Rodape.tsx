import Link from "next/link";
import { Simbolo } from "@/components/marca/Simbolo";
import type { Links, Textos } from "@/lib/tipos";

interface Props {
  links: Links;
  textos: Textos;
}

function LinkExterno({ href, children }: { href: string; children: React.ReactNode }) {
  if (!href) return null;
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        {children}
      </a>
    </li>
  );
}

export function Rodape({ links, textos }: Props) {
  const ano = new Date().getFullYear();
  const temRedes = links.whatsapp || links.youtube || links.instagram || links.sala_ao_vivo;

  return (
    <footer className="mt-16 border-t">
      <div className="conteudo grid gap-8 py-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <p className="flex items-center gap-2 font-semibold">
            <Simbolo aria-hidden className="h-5 w-auto" /> Delta Robôs
          </p>
          <p className="text-muted-foreground">
            Performance ao vivo dos robôs de day trade, direto do MetaTrader 5, normalizada por
            contrato.
          </p>
        </div>

        <div className="space-y-2">
          <p className="font-medium">Navegação</p>
          <ul className="space-y-1">
            <li>
              <Link href="/#robos" className="text-muted-foreground hover:text-foreground">
                Robôs
              </Link>
            </li>
            <li>
              <Link href="/#comunidade" className="text-muted-foreground hover:text-foreground">
                Comunidade
              </Link>
            </li>
            <li>
              <Link href="/#como-comecar" className="text-muted-foreground hover:text-foreground">
                Como começar
              </Link>
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="font-medium">Redes</p>
          {temRedes ? (
            <ul className="space-y-1">
              <LinkExterno href={links.whatsapp}>WhatsApp</LinkExterno>
              <LinkExterno href={links.youtube}>YouTube</LinkExterno>
              <LinkExterno href={links.instagram}>Instagram</LinkExterno>
              <LinkExterno href={links.sala_ao_vivo}>Sala ao vivo</LinkExterno>
            </ul>
          ) : (
            <p className="text-muted-foreground">Em breve.</p>
          )}
        </div>

        <div className="space-y-2">
          <p className="font-medium">Contato</p>
          {textos.contato_email ? (
            <a
              href={`mailto:${textos.contato_email}`}
              className="text-muted-foreground hover:text-foreground"
            >
              {textos.contato_email}
            </a>
          ) : (
            <p className="text-muted-foreground">Pelo WhatsApp da comunidade.</p>
          )}
        </div>
      </div>

      <div className="border-t">
        <div className="conteudo space-y-2 py-6 text-xs text-muted-foreground">
          <p>{textos.disclaimer}</p>
          <p>© {ano} Delta Robôs. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
