import Link from "next/link";
import { comMarcaAtual } from "@/components/compartilhados/marca";
import { Simbolo } from "@/components/marca/Simbolo";
import type { Links, Textos } from "@/lib/tipos";

interface Props {
  links: Links;
  textos: Textos;
  /** os robôs do cabeçalho (sem os arquivados), na mesma ordem */
  robos: { slug: string; nome: string }[];
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

function Coluna({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="font-medium">{titulo}</p>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

/**
 * 19/09/2026: a Navegação tem os mesmos destinos do cabeçalho (Comparativo e Metodologia faltavam, e no
 * celular não havia outro caminho até eles). Coluna sem link não aparece: o "Em breve." das Redes e o
 * "Pelo WhatsApp da comunidade." sem link do Contato saíram. O aviso legal fica sem o "tnum" da página,
 * que alargava o hífen no meio do texto.
 *
 * Mais tarde no mesmo dia (Artur: "no rodapé alinhe ele e deixe todos os links vinculados"): a grade de 4
 * colunas tinha 3 em uso e a quarta vazia deixava tudo puxado para a esquerda. Agora são marca, Robôs (um
 * link por robô), Site e Redes, espalhados na largura do conteúdo: a marca na borda esquerda, as Redes
 * na direita. No celular, 2 por 2. A marca leva à home; o e-mail entrou nas Redes; "Como começar" segue
 * indo para o WhatsApp (pedido de 18/09/2026) e, sem ele, vai para os passos da home.
 */
export function Rodape({ links, textos, robos }: Props) {
  const ano = new Date().getFullYear();
  const temRedes = links.whatsapp || links.youtube || links.instagram || links.sala_ao_vivo || textos.contato_email;

  return (
    <footer className="mt-16 border-t">
      <div className="conteudo grid grid-cols-2 gap-x-6 gap-y-8 py-10 text-sm md:flex md:justify-between">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 font-semibold">
            <Simbolo aria-hidden className="h-5 w-auto" /> Quants Robôs
          </Link>
        </div>

        {robos.length > 0 ? (
          <Coluna titulo="Robôs">
            {robos.map((r) => (
              <LinkInterno key={r.slug} href={`/robos/${r.slug}`}>
                {r.nome}
              </LinkInterno>
            ))}
          </Coluna>
        ) : null}

        <Coluna titulo="Site">
          <LinkInterno href="/comparativo">Comparativo</LinkInterno>
          {/* leitura rara, como no cabeçalho: sem prefetch */}
          <LinkInterno href="/metodologia" prefetch={false}>
            Metodologia
          </LinkInterno>
          <LinkInterno href="/#comunidade">Comunidade</LinkInterno>
          {links.whatsapp ? (
            <LinkExterno href={links.whatsapp}>Como começar</LinkExterno>
          ) : (
            <LinkInterno href="/#como-comecar">Como começar</LinkInterno>
          )}
        </Coluna>

        {temRedes ? (
          <Coluna titulo="Redes">
            <LinkExterno href={links.whatsapp}>WhatsApp</LinkExterno>
            <LinkExterno href={links.youtube}>YouTube</LinkExterno>
            <LinkExterno href={links.instagram}>Instagram</LinkExterno>
            <LinkExterno href={links.sala_ao_vivo}>Sala ao vivo</LinkExterno>
            {textos.contato_email ? (
              <li>
                <a
                  href={`mailto:${textos.contato_email}`}
                  className="text-muted-foreground transition-colors [overflow-wrap:anywhere] hover:text-foreground"
                >
                  {textos.contato_email}
                </a>
              </li>
            ) : null}
          </Coluna>
        ) : null}
      </div>

      <div className="border-t">
        <div className="conteudo space-y-2 py-6 text-xs text-muted-foreground">
          <p className="[font-feature-settings:normal]">{comMarcaAtual(textos.disclaimer)}</p>
          <p>© {ano} Quants Robôs. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
