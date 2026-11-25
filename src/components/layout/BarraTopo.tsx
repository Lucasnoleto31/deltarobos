import Link from "next/link";
import { FitaMercado } from "@/components/home/BarraAoVivo";
import { Simbolo } from "@/components/marca/Simbolo";

/**
 * A barra do topo da área de trabalho (ficha Mesa, 25/11/2026): a fita de mercado. No computador é uma linha
 * só, presa no alto, ao lado da barra lateral.
 *
 * No celular (versão própria, 25/11/2026) são duas linhas que NÃO ficam presas: a marca e, embaixo, a fita,
 * que rola de lado. Presa no celular fica a barra de navegação de baixo (BarraInferior); com a fita presa
 * em cima, mais as abas do robô, sobrava pouca tela para o conteúdo. O botão de menu e a gaveta saíram.
 *
 * A altura do que fica preso em cima entra no --altura-cabecalho do globals.css (0 no celular, 49 px a
 * partir de lg), que é o que a rolagem até uma âncora e as abas do robô descontam.
 */
export function BarraTopo() {
  return (
    <header className="barra-vidro z-40 lg:sticky lg:top-0">
      <div className="flex flex-wrap items-center gap-x-3 px-4 sm:px-6 lg:px-10 min-[1700px]:px-14">
        <Link href="/" className="flex h-12 items-center gap-2 text-[0.9375rem] font-semibold tracking-tight lg:hidden">
          <Simbolo aria-hidden className="h-5 w-auto text-marca" />
          <span>
            Quants <span className="font-normal text-muted-foreground">Robôs</span>
          </span>
        </Link>

        {/* uma fita só: no celular ocupa a linha de baixo (com o fio em cima), no computador a barra inteira */}
        <FitaMercado className="-mx-4 h-9 basis-full border-t px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:h-12 lg:flex-1 lg:basis-0 lg:border-t-0 lg:px-0" />
      </div>
    </header>
  );
}
