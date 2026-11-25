"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname, useSelectedLayoutSegment } from "next/navigation";
import { TextoDeHoje } from "@/components/home/TextoDeHoje";
import { useRobosAoVivo, type RoboBase } from "@/components/home/useRobosAoVivo";
import { Simbolo } from "@/components/marca/Simbolo";
import { buttonVariants } from "@/components/ui/button";
import type { Links } from "@/lib/tipos";
import { AlternadorTema } from "./AlternadorTema";

// Como funciona é leitura rara: sem prefetch, busca no clique em vez de em toda página (18/09/2026)
const AREAS: { href: string; rotulo: string; exato?: boolean; prefetch?: false }[] = [
  { href: "/", rotulo: "Visão geral", exato: true },
  { href: "/comparativo", rotulo: "Comparar robôs" },
  { href: "/simulador", rotulo: "Simular meu capital" },
  { href: "/metodologia", rotulo: "Como funciona", prefetch: false },
];

interface Props {
  robos: RoboBase[];
  links: Links;
  /** na gaveta do celular, fechar ao escolher um destino */
  aoNavegar?: () => void;
}

/**
 * A barra lateral do sistema (ficha Mesa, 25/11/2026): a marca, as áreas e os robôs. Fica fixa em toda
 * página no computador; no celular é o miolo da gaveta. Só texto: sem ícone, sem caixa, sem selo. O item da
 * página atual leva um fio à esquerda.
 *
 * Debaixo do nome de cada robô vai o que ele fez hoje, em palavras comuns e ao vivo ("hoje +R$ 240 em 3
 * operações", "hoje ainda sem operação", "em operação agora"): é onde o "ao vivo" aparece por robô em toda
 * página. Os robôs vêm do banco (nunca fixos no código), sem os arquivados.
 */
export function ConteudoLateral({ robos, links, aoNavegar }: Props) {
  const pathname = usePathname();
  // A página inicial se reconhece pelo segmento de rota, não por pathname === "/": no HTML estático da home o
  // servidor não enxerga "/" no usePathname, e o item atual só aparecia no navegador, com erro de hidratação
  // #418 em toda visita (o mesmo caso do BotaoGrupo em 20/09/2026). O segmento é igual no servidor e no cliente.
  const naHome = useSelectedLayoutSegment() === null;
  const vivos = useRobosAoVivo(robos);

  return (
    <>
      <Link
        href="/"
        onClick={aoNavegar}
        className="flex h-12 shrink-0 items-center gap-2.5 border-b px-5 text-[0.9375rem] font-semibold tracking-tight"
      >
        <Simbolo aria-hidden className="h-5 w-auto text-marca" />
        <span>
          Quants <span className="font-normal text-muted-foreground">Robôs</span>
        </span>
      </Link>

      <nav aria-label="Áreas" className="py-5">
        <ul>
          {AREAS.map((a) => {
            const atual = a.exato ? naHome : pathname.startsWith(a.href);
            return (
              <li key={a.href}>
                <Link
                  href={a.href}
                  prefetch={a.prefetch}
                  onClick={aoNavegar}
                  aria-current={atual ? "page" : undefined}
                  className={cn(
                    "relative block px-5 py-[0.4375rem] text-sm transition-colors",
                    atual ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {atual ? <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 bg-foreground" /> : null}
                  {a.rotulo}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav aria-label="Robôs" className="min-h-0 flex-1 border-t pt-5">
        <p className="px-5 pb-2 text-[0.8125rem] text-sutil">Robôs</p>
        {vivos.length === 0 ? (
          <p className="px-5 py-2 text-sm text-muted-foreground">Nenhum robô cadastrado.</p>
        ) : (
          <ul>
            {vivos.map((r) => {
              const atual = pathname === `/robos/${r.slug}` || pathname.startsWith(`/robos/${r.slug}/`);
              return (
                <li key={r.slug}>
                  <Link
                    href={`/robos/${r.slug}`}
                    onClick={aoNavegar}
                    aria-current={atual ? "page" : undefined}
                    className={cn("relative block px-5 py-2 transition-colors hover:bg-(--linha-hover)", atual && "bg-(--linha-hover)")}
                  >
                    {atual ? <span aria-hidden className="absolute inset-y-2.5 left-0 w-0.5 bg-foreground" /> : null}
                    <span className={cn("block truncate text-sm", atual ? "font-medium" : "text-foreground")}>{r.nome}</span>
                    <TextoDeHoje
                      robo={{ statusAoVivo: r.statusAoVivo, operouHoje: r.operouHoje, hoje: r.hoje, hojeOperacoes: r.hojeOperacoes }}
                      className="block text-xs text-pretty"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="shrink-0 space-y-3.5 px-5 pb-5">
        <p className="text-xs leading-relaxed text-pretty text-sutil">Todos os valores são para 1 contrato, já descontados os custos.</p>
        <div className="flex items-center gap-2">
          {links.whatsapp ? (
            <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" className={buttonVariants({ className: "h-9 flex-1" })}>
              Como começar
            </a>
          ) : (
            <Link href="/metodologia#como-comecar" onClick={aoNavegar} className={buttonVariants({ className: "h-9 flex-1" })}>
              Como começar
            </Link>
          )}
          <AlternadorTema />
        </div>
      </div>
    </>
  );
}
