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

function LinkInterno({ href, children, prefetch }: { href: string; children: React.ReactNode; prefetch?: false }) {
  return (
    <li>
      <Link href={href} prefetch={prefetch} className="text-muted-foreground transition-colors hover:text-foreground">
        {children}
      </Link>
    </li>
  );
}

/**
 * 19/09/2026: a Navegação tem os mesmos destinos do cabeçalho (Comparativo e Metodologia faltavam, e no
 * celular não havia outro caminho até eles). Coluna sem link não aparece: o "Em breve." das Redes e o
 * "Pelo WhatsApp da comunidade." sem link do Contato saíram. O Contato é só o e-mail: o link do WhatsApp
 * já está em "Como começar" e nas Redes, e o "Grupo no WhatsApp" era a terceira vez dele no rodapé.
 * O aviso legal fica sem o "tnum" da página, que alargava o hífen no meio do texto.
 */
export function Rodape({ links, textos }: Props) {
  const ano = new Date().getFullYear();
  const temRedes = links.whatsapp || links.youtube || links.instagram || links.sala_ao_vivo;
  const temContato = Boolean(textos.contato_email);

  return (
    <footer className="mt-16 border-t">
      <div className="conteudo grid gap-8 py-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <p className="flex items-center gap-2 font-semibold">
            <Simbolo aria-hidden className="h-5 w-auto" /> Delta Robôs
          </p>
        </div>

        <div className="space-y-2">
          <p className="font-medium">Navegação</p>
          <ul className="space-y-1">
            <LinkInterno href="/#robos">Robôs</LinkInterno>
            <LinkInterno href="/comparativo">Comparativo</LinkInterno>
            {/* leitura rara, como no cabeçalho: sem prefetch */}
            <LinkInterno href="/metodologia" prefetch={false}>
              Metodologia
            </LinkInterno>
            <LinkInterno href="/#comunidade">Comunidade</LinkInterno>
            <LinkExterno href={links.whatsapp}>Como começar</LinkExterno>
          </ul>
        </div>

        {temRedes ? (
          <div className="space-y-2">
            <p className="font-medium">Redes</p>
            <ul className="space-y-1">
              <LinkExterno href={links.whatsapp}>WhatsApp</LinkExterno>
              <LinkExterno href={links.youtube}>YouTube</LinkExterno>
              <LinkExterno href={links.instagram}>Instagram</LinkExterno>
              <LinkExterno href={links.sala_ao_vivo}>Sala ao vivo</LinkExterno>
            </ul>
          </div>
        ) : null}

        {temContato ? (
          <div className="space-y-2">
            <p className="font-medium">Contato</p>
            <ul className="space-y-1">
              <li>
                <a
                  href={`mailto:${textos.contato_email}`}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {textos.contato_email}
                </a>
              </li>
            </ul>
          </div>
        ) : null}
      </div>

      <div className="border-t">
        <div className="conteudo space-y-2 py-6 text-xs text-muted-foreground">
          <p className="[font-feature-settings:normal]">{textos.disclaimer}</p>
          <p>© {ano} Delta Robôs. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
