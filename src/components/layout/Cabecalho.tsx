import Link from "next/link";
import { Simbolo } from "@/components/marca/Simbolo";
import { AlternadorTema } from "./AlternadorTema";

const LINKS = [
  { href: "/#robos", rotulo: "Robôs" },
  { href: "/comparativo", rotulo: "Comparativo" },
  { href: "/metodologia", rotulo: "Metodologia" },
  { href: "/#comunidade", rotulo: "Comunidade" },
  { href: "/#como-comecar", rotulo: "Como começar" },
];

export function Cabecalho() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="conteudo flex h-14 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Simbolo aria-hidden className="h-7 w-auto" />
          <span>
            Delta <span className="text-muted-foreground">Robôs</span>
          </span>
        </Link>

        <nav aria-label="Principal" className="flex items-center gap-1 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hidden rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:text-foreground sm:inline-block"
            >
              {l.rotulo}
            </Link>
          ))}
          <AlternadorTema />
        </nav>
      </div>
    </header>
  );
}
