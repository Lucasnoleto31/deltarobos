import Link from "next/link";
import type { Links } from "@/lib/tipos";
import { AbasRobos, type RoboDaAba } from "./AbasRobos";
import { AlternadorTema } from "./AlternadorTema";
import { BotaoGrupo } from "./BotaoGrupo";
import { LinksNav } from "./LinksNav";
import { Marca } from "./Marca";

interface Props {
  links: Links;
  /** os robôs das abas, sem os arquivados; o layout busca uma vez e passa o mesmo ao rodapé */
  robos: RoboDaAba[];
}

/**
 * Cabeçalho no desenho das plataformas de trading que o Artur mandou em 18/09/2026: marca à esquerda;
 * no meio, os robôs como abas de instrumento (pílulas numa cápsula) e depois os outros links; à direita,
 * o tema e o botão "Como começar" (fora da home). O menu suspenso de robôs que ficou uma tarde no ar saiu
 * ("essa opção da nav bar não está legal"). No celular a navegação desce para uma segunda linha e rola de
 * lado, com as pontas esmaecendo; desde 19/09/2026 os links de texto vêm junto, depois dos robôs (antes
 * sumiam no celular e Comparativo e Metodologia ficavam sem caminho).
 * O -ml-1/px-1/-my-1/py-1 da faixa dá espaço ao anel de foco sem mexer no alinhamento: a rolagem
 * corta o que passa da borda.
 *
 * 13/10/2026 (mídia kit da Zeve): o "Z" azul na marca, a página atual tintada no acento, o ponto da cor de
 * cada robô e o botão no azul. A partir de lg a navegação vai a 13 px e as pílulas a 10 px de respiro
 * lateral, com 12 px entre os três blocos: na Poppins, com 14 px, três robôs e os quatro links não fechavam
 * a linha nem na largura máxima do conteúdo, e a faixa rolava cortando os últimos links (medido em 1.024 px;
 * entre lg e xl a Comunidade também sai, ver LinksNav). A altura não mudou (91 px até lg, 57 px a partir
 * dele: o globals.css desconta essas medidas na rolagem até as âncoras).
 */
export function Cabecalho({ links, robos }: Props) {
  return (
    <header className="sticky top-0 z-40 barra-vidro">
      <div className="conteudo flex flex-wrap items-center gap-x-4 gap-y-2 py-2 lg:h-14 lg:flex-nowrap lg:gap-x-3 lg:py-0">
        <Link href="/" className="flex shrink-0 items-center rounded-md">
          <Marca />
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-1 lg:order-3">
          <AlternadorTema />
          {links.whatsapp ? <BotaoGrupo href={links.whatsapp} /> : null}
        </div>

        <nav
          aria-label="Principal"
          className="borda-esmaece -my-1 -ml-1 flex basis-full items-center gap-1 overflow-x-auto px-1 py-1 text-sm [scrollbar-width:none] lg:order-2 lg:mx-auto lg:basis-auto lg:text-[13px] [&::-webkit-scrollbar]:hidden"
        >
          <AbasRobos robos={robos} />
          <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-(--painel-fio-forte)" />
          <LinksNav />
        </nav>
      </div>
    </header>
  );
}
