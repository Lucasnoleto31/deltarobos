import Link from "next/link";
import { comMarcaAtual } from "@/components/compartilhados/marca";
import { linkAberturaDeConta } from "@/components/home/ComoComecar";
import type { Links, Textos } from "@/lib/tipos";

interface Props {
  links: Links;
  textos: Textos;
}

function Externo({ href, children }: { href: string; children: React.ReactNode }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-muted-foreground transition-colors hover:text-foreground">
      {children}
    </a>
  );
}

/**
 * O pé da área de trabalho (ficha Mesa, 25/11/2026, segunda passada): uma linha de links para fora do site
 * (abrir conta, grupo, sala, vídeos) e o aviso legal. As quatro colunas de antes repetiam a barra lateral,
 * que agora existe em toda página; os canais da comunidade, que eram uma seção da página inicial, ficaram
 * só aqui e no botão "Como começar".
 *
 * O aviso legal fica inteiro (é obrigação de site de resultado financeiro), em letra pequena e em colunas na
 * tela larga, sem o "tnum" da página, que alargava o hífen no meio do texto.
 */
export function Rodape({ links, textos }: Props) {
  const ano = new Date().getFullYear();

  return (
    <footer className="border-t">
      <div className="conteudo py-7 text-[0.8125rem] text-sutil">
        <div className="flex flex-wrap gap-x-7 gap-y-2">
          {/* os três passos e o link de abertura de conta moram em Como funciona */}
          <Link href="/metodologia#como-comecar" prefetch={false} className="text-muted-foreground transition-colors hover:text-foreground">
            Como começar
          </Link>
          <Externo href={linkAberturaDeConta(links)}>Abrir conta na corretora parceira</Externo>
          <Externo href={links.whatsapp}>Grupo no WhatsApp</Externo>
          <Externo href={links.sala_ao_vivo}>Sala ao vivo</Externo>
          <Externo href={links.youtube}>YouTube</Externo>
          <Externo href={links.instagram}>Instagram</Externo>
          {textos.contato_email ? (
            <a href={`mailto:${textos.contato_email}`} className="text-muted-foreground transition-colors [overflow-wrap:anywhere] hover:text-foreground">
              {textos.contato_email}
            </a>
          ) : null}
          <span className="ml-auto">© {ano} Quants Robôs</span>
        </div>
        <p className="mt-5 max-w-[150ch] gap-x-12 leading-relaxed [font-variant-numeric:normal] xl:columns-2">{comMarcaAtual(textos.disclaimer)}</p>
      </div>
    </footer>
  );
}
