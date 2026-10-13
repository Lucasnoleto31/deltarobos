import Link from "next/link";
import { comMarcaAtual } from "@/components/compartilhados/marca";
import { corDoRobo } from "@/lib/cores-robo";
import type { Links, Textos } from "@/lib/tipos";
import type { RoboDaAba } from "./AbasRobos";
import { Marca } from "./Marca";

interface Props {
  links: Links;
  textos: Textos;
  /** os robôs do cabeçalho (sem os arquivados), na mesma ordem */
  robos: RoboDaAba[];
}

const CLASSE_LINK = "text-muted-foreground transition-colors hover:text-foreground";

function LinkExterno({ href, children }: { href: string; children: React.ReactNode }) {
  if (!href) return null;
  return (
    <li>
      <a href={href} target="_blank" rel="noopener noreferrer" className={CLASSE_LINK}>
        {children}
      </a>
    </li>
  );
}

function LinkInterno({ href, children, prefetch }: { href: string; children: React.ReactNode; prefetch?: false }) {
  return (
    <li>
      <Link href={href} prefetch={prefetch} className={CLASSE_LINK}>
        {children}
      </Link>
    </li>
  );
}

function Coluna({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="font-medium">{titulo}</p>
      <ul className="space-y-2">{children}</ul>
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
 *
 * 13/10/2026 (mídia kit da Zeve): a marca é a mesma do cabeçalho (Marca), cada robô leva o ponto da cor
 * dele, e o aviso legal ganhou rótulo e linha de leitura: corria a largura inteira do conteúdo, com linhas
 * de mais de 150 caracteres a 12 px. Agora fica em até 80 caracteres de largura, com entrelinha folgada. O
 * texto é o do banco, sem mudança.
 */
export function Rodape({ links, textos, robos }: Props) {
  const ano = new Date().getFullYear();
  const temRedes = links.whatsapp || links.youtube || links.instagram || links.sala_ao_vivo || textos.contato_email;

  return (
    <footer className="mt-16 border-t border-(--painel-fio)">
      <div className="conteudo grid grid-cols-2 gap-x-6 gap-y-8 py-10 text-sm md:flex md:justify-between">
        <div>
          <Link href="/" className="inline-flex rounded-md">
            <Marca />
          </Link>
        </div>

        {robos.length > 0 ? (
          <Coluna titulo="Robôs">
            {robos.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/robos/${r.slug}`}
                  style={{ "--cor-robo": corDoRobo(r.ordem) } as React.CSSProperties}
                  className={`inline-flex items-center gap-2 ${CLASSE_LINK}`}
                >
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-(--cor-robo)" />
                  {r.nome}
                </Link>
              </li>
            ))}
          </Coluna>
        ) : null}

        <Coluna titulo="Site">
          <LinkInterno href="/comparativo">Comparativo</LinkInterno>
          <LinkInterno href="/simulador">Simulador</LinkInterno>
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
                <a href={`mailto:${textos.contato_email}`} className={`${CLASSE_LINK} [overflow-wrap:anywhere]`}>
                  {textos.contato_email}
                </a>
              </li>
            ) : null}
          </Coluna>
        ) : null}
      </div>

      <div className="border-t border-(--painel-fio)">
        <div className="conteudo space-y-3 py-8 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Aviso legal</p>
          <p className="max-w-[80ch] leading-relaxed [font-feature-settings:normal]">{comMarcaAtual(textos.disclaimer)}</p>
          <p className="pt-1">© {ano} Quants Robôs. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
