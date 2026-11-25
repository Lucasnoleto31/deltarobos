"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname, useSelectedLayoutSegment } from "next/navigation";
import { useState } from "react";
import { linkAberturaDeConta } from "@/components/home/ComoComecar";
import { TextoDeHoje } from "@/components/home/TextoDeHoje";
import { useRobosAoVivo, type RoboBase } from "@/components/home/useRobosAoVivo";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { Links } from "@/lib/tipos";
import { AlternadorTema } from "./AlternadorTema";

interface Props {
  robos: RoboBase[];
  links: Links;
  /** os custos dos robôs com números no site, de custosDaSoma (lib/premissa), para a nota da folha de robôs */
  custos: string;
}

type Folha = "robos" | "mais";

const ITEM =
  "relative flex h-13 w-full items-center justify-center px-1 text-xs whitespace-nowrap outline-none transition-colors focus-visible:bg-(--linha-hover)";
const ATUAL = "font-medium text-foreground before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:bg-foreground";
const LINHA = "linha-interativa flex min-h-13 items-center justify-between gap-4 px-5 py-2.5 outline-none focus-visible:bg-(--linha-hover)";

/**
 * A navegação do celular (25/11/2026, Lucas: "monte a versão também para o celular"): uma barra presa
 * embaixo, ao alcance do polegar, com o que a barra lateral tem no computador: Visão geral, Robôs, Simular e
 * Mais. Visão geral e Simular navegam; Robôs e Mais abrem uma folha que sobe de baixo: a dos robôs traz a
 * lista com o que cada um fez hoje, ao vivo; a de Mais, Como funciona, como começar, os canais e o tema. Era
 * um botão de menu no canto de cima abrindo uma gaveta com tudo dentro.
 *
 * "Comparar" saiu da barra em 25/11/2026: a página deixou de existir, e a comparação é a lista da Visão
 * geral. Na folha dos robôs saiu o resultado do mês, que era um número de ganho sem a maior queda ao lado
 * (DESIGN.md, seção 9); ficou o que cada robô fez hoje, como na barra lateral.
 *
 * Só texto, como a barra lateral; o item atual leva um fio em cima. A folha guarda em que página foi aberta:
 * navegar (por ela ou pelo voltar do navegador) a fecha. Some a partir de lg, onde a barra lateral existe.
 */
export function BarraInferior({ robos, links, custos }: Props) {
  const pathname = usePathname();
  // a home pelo segmento de rota, não por pathname === "/": no HTML estático dela o servidor não enxerga "/"
  // (erro de hidratação #418; ver BarraLateral)
  const naHome = useSelectedLayoutSegment() === null;
  const vivos = useRobosAoVivo(robos);
  const [aberta, setAberta] = useState<{ folha: Folha; em: string } | null>(null);
  const folha = aberta && aberta.em === pathname ? aberta.folha : null;
  const abrir = (qual: Folha) => setAberta({ folha: qual, em: pathname });
  const fechar = () => setAberta(null);

  const emRobo = pathname.startsWith("/robos/");
  const emMais = pathname.startsWith("/metodologia");

  return (
    <>
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="grid grid-cols-4 text-muted-foreground">
          <li>
            <Link href="/" aria-current={naHome ? "page" : undefined} className={cn(ITEM, naHome && folha === null && ATUAL)}>
              Visão geral
            </Link>
          </li>
          <li>
            <button type="button" onClick={() => abrir("robos")} aria-haspopup="dialog" className={cn(ITEM, (folha === "robos" || (emRobo && folha === null)) && ATUAL)}>
              Robôs
            </button>
          </li>
          <li>
            <Link
              href="/simulador"
              aria-current={pathname.startsWith("/simulador") ? "page" : undefined}
              className={cn(ITEM, pathname.startsWith("/simulador") && folha === null && ATUAL)}
            >
              Simular
            </Link>
          </li>
          <li>
            <button type="button" onClick={() => abrir("mais")} aria-haspopup="dialog" className={cn(ITEM, (folha === "mais" || (emMais && folha === null)) && ATUAL)}>
              Mais
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={folha === "robos"} onOpenChange={(v) => (v ? abrir("robos") : fechar())}>
        <SheetContent side="bottom" showCloseButton={false} className="max-h-[80dvh] gap-0 overflow-y-auto bg-background p-0 pb-[env(safe-area-inset-bottom)]">
          <SheetTitle className="border-b px-5 py-3.5 text-[0.9375rem] font-medium">Robôs</SheetTitle>
          {vivos.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">Nenhum robô cadastrado.</p>
          ) : (
            <ul>
              {vivos.map((r) => {
                const atual = pathname === `/robos/${r.slug}` || pathname.startsWith(`/robos/${r.slug}/`);
                return (
                  <li key={r.slug} className="border-b last:border-b-0">
                    <Link href={`/robos/${r.slug}`} onClick={fechar} aria-current={atual ? "page" : undefined} className={cn(LINHA, atual && "bg-(--linha-hover)")}>
                      <span className="min-w-0">
                        <span className="block truncate text-[0.9375rem] font-medium">{r.nome}</span>
                        <TextoDeHoje
                          robo={{ statusAoVivo: r.statusAoVivo, operouHoje: r.operouHoje, hoje: r.hoje, hojeOperacoes: r.hojeOperacoes }}
                          className="block truncate"
                        />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t px-5 py-3 text-xs text-pretty text-sutil">Todos os valores são para 1 contrato por entrada, {custos}.</p>
        </SheetContent>
      </Sheet>

      <Sheet open={folha === "mais"} onOpenChange={(v) => (v ? abrir("mais") : fechar())}>
        <SheetContent side="bottom" showCloseButton={false} className="max-h-[80dvh] gap-0 overflow-y-auto bg-background p-0 pb-[env(safe-area-inset-bottom)]">
          <SheetTitle className="sr-only">Mais</SheetTitle>
          <ul className="text-[0.9375rem]">
            <li className="border-b">
              <Link href="/metodologia" onClick={fechar} aria-current={emMais ? "page" : undefined} className={LINHA}>
                Como funciona
                <span className="text-[0.8125rem] text-sutil">de onde vêm os números</span>
              </Link>
            </li>
            <li className="border-b">
              <Link href="/metodologia#como-comecar" onClick={fechar} className={LINHA}>
                Como começar
                <span className="text-[0.8125rem] text-sutil">três passos</span>
              </Link>
            </li>
            <li className="border-b">
              <a href={linkAberturaDeConta(links)} target="_blank" rel="noopener noreferrer" className={LINHA}>
                Abrir conta na corretora parceira
              </a>
            </li>
            {links.sala_ao_vivo ? (
              <li className="border-b">
                <a href={links.sala_ao_vivo} target="_blank" rel="noopener noreferrer" className={LINHA}>
                  Sala ao vivo
                </a>
              </li>
            ) : null}
            {links.youtube ? (
              <li className="border-b">
                <a href={links.youtube} target="_blank" rel="noopener noreferrer" className={LINHA}>
                  YouTube
                </a>
              </li>
            ) : null}
            {links.instagram ? (
              <li className="border-b">
                <a href={links.instagram} target="_blank" rel="noopener noreferrer" className={LINHA}>
                  Instagram
                </a>
              </li>
            ) : null}
          </ul>
          <div className="flex items-center gap-3 px-5 py-4">
            {links.whatsapp ? (
              <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" className={buttonVariants({ className: "h-10 flex-1" })}>
                Falar com a equipe no WhatsApp
              </a>
            ) : null}
            <AlternadorTema />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
