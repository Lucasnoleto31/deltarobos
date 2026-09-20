import { cn } from "cn";
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

function Marca({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex shrink-0 items-center gap-2 font-semibold tracking-tight", className)}>
      <Simbolo aria-hidden className="h-7 w-auto" />
      <span>
        Quants <span className="text-muted-foreground">Robôs</span>
      </span>
    </Link>
  );
}

/**
 * A navegação do site, em duas formas da mesma coisa.
 *
 * A partir de xl (1280 px) ela é uma BARRA LATERAL fixa à esquerda (20/09/2026, Artur: "a barra lateral
 * para navegar ainda não foi alterada"): marca no topo, os robôs um por linha, os links do site e, no
 * pé, o tema e a pílula "Como começar". Tudo à vista — sem menu suspenso, que ele cortou em 18/09/2026,
 * e sem "+N". O recuo do conteúdo é do layout do site, que conhece a mesma --largura-barra.
 *
 * Até xl continua o cabeçalho de cima, como está desde 18/09/2026: marca à esquerda; no meio, os robôs
 * como abas de instrumento (pílulas, a atual em branco) e depois os links; à direita, o tema e a pílula.
 * No celular a navegação desce para uma segunda linha e rola de lado, com as pontas esmaecendo, e desde
 * 19/09/2026 os links de texto vêm junto, depois dos robôs. O -ml-1/px-1/-my-1/py-1 da faixa dá espaço
 * ao anel de foco sem mexer no alinhamento: a rolagem corta o que passa da borda.
 *
 * As duas formas existem no DOM e quem escolhe é o CSS (xl:hidden / hidden xl:flex): o que está
 * escondido não é lido nem tabulado, e trocar por largura medida em JavaScript daria salto na carga.
 */
export function Cabecalho({ links, robos }: Props) {
  return (
    <>
      {/* só aparece no foco; sem sr-only para não brigar com o position dos utilitários */}
      <a
        href="#principal"
        className="pointer-events-none fixed top-2 left-2 z-50 -translate-y-20 rounded-md border border-(--painel-fio) bg-popover px-3 py-2 text-sm font-medium text-popover-foreground opacity-0 focus:pointer-events-auto focus:translate-y-0 focus:opacity-100"
      >
        Pular para o conteúdo
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-(--largura-barra) flex-col overflow-y-auto border-r border-(--painel-fio) bg-background px-3 py-4 xl:flex">
        <Marca className="px-3" />

        <nav aria-label="Principal" className="mt-6 flex flex-col gap-3">
          <AbasRobos robos={robos} orientacao="coluna" />
          {robos.length > 0 ? <span aria-hidden className="mx-3 h-px shrink-0 bg-(--painel-fio)" /> : null}
          <div className="flex flex-col gap-0.5">
            <LinksNav orientacao="coluna" />
          </div>
        </nav>

        {/* mt-auto encosta o pé embaixo quando sobra tela; quando não sobra, o aside rola */}
        <div className="mt-auto flex shrink-0 items-center gap-2 pt-6">
          <AlternadorTema />
          {links.whatsapp ? <BotaoGrupo href={links.whatsapp} className="flex-1" /> : null}
        </div>
      </aside>

      <header className="sticky top-0 z-40 barra-vidro xl:hidden">
        <div className="conteudo flex flex-wrap items-center gap-x-4 gap-y-2 py-2 lg:h-14 lg:flex-nowrap lg:py-0">
          <Marca />

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
    </>
  );
}
