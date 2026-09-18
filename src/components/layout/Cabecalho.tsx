import Link from "next/link";
import { Simbolo } from "@/components/marca/Simbolo";
import { listarRobos } from "@/lib/consultas/publico";
import { AlternadorTema } from "./AlternadorTema";
import { MenuRobos } from "./MenuRobos";

// "Robôs" não é mais um link para a home (era redundante com o logo): é o menu com cada robô, à esquerda
// dos outros links, e aparece no celular também (18/09/2026).
const LINKS = [
  { href: "/comparativo", rotulo: "Comparativo" },
  { href: "/metodologia", rotulo: "Metodologia" },
  { href: "/#comunidade", rotulo: "Comunidade" },
  { href: "/#como-comecar", rotulo: "Como começar" },
];

export async function Cabecalho() {
  const robos = (await listarRobos())
    .filter((r) => r.status !== "arquivado")
    .map((r) => ({ slug: r.slug, nome: r.nome, ativo: r.ativo }));

  return (
    <header className="sticky top-0 z-40 barra-vidro">
      <div className="conteudo flex h-14 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Simbolo aria-hidden className="h-7 w-auto" />
          <span>
            Delta <span className="text-muted-foreground">Robôs</span>
          </span>
        </Link>

        <nav aria-label="Principal" className="flex items-center gap-1 text-sm">
          <MenuRobos robos={robos} />
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
