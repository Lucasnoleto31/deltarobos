"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/comparativo", rotulo: "Comparativo" },
  { href: "/metodologia", rotulo: "Metodologia" },
  { href: "/#comunidade", rotulo: "Comunidade" },
];

/** Os links do cabeçalho, com a página atual marcada. Escondidos no celular (o menu de robôs fica). */
export function LinksNav() {
  const pathname = usePathname();
  return (
    <>
      {LINKS.map((l) => {
        const atual = !l.href.includes("#") && pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={atual ? "page" : undefined}
            className={cn(
              "hidden h-8 shrink-0 items-center rounded-full px-3 whitespace-nowrap transition-colors sm:inline-flex",
              atual ? "bg-(--linha-hover) text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l.rotulo}
          </Link>
        );
      })}
    </>
  );
}
