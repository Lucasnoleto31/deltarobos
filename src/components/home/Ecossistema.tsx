import { ArrowUpRight, Gift, GraduationCap, LineChart } from "lucide-react";
import type { Links } from "@/lib/tipos";

interface Props {
  links: Links;
}

/** Item 9 da home: treinamentos, painel de mercado e programa de pontos (links externos). */
export function Ecossistema({ links }: Props) {
  const cards = [
    {
      href: links.treinamentos,
      icone: <GraduationCap className="size-5" />,
      titulo: "Treinamentos",
      texto: "Cursos e mentorias da Delta.",
    },
    {
      href: links.painel_mercado,
      icone: <LineChart className="size-5" />,
      titulo: "Painel de mercado",
      texto: "Leitura diária do mercado feita pela equipe.",
    },
    {
      href: links.programa_pontos,
      icone: <Gift className="size-5" />,
      titulo: "Programa de pontos",
      texto: "Pontos por lotes operados, trocados por benefícios.",
    },
  ].filter((c) => c.href);

  if (cards.length === 0) return null;

  return (
    <section id="ecossistema" className="conteudo scroll-mt-20 py-8">
      <div className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Ecossistema Delta</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <a
            key={c.titulo}
            href={c.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 painel p-5 painel-interativo"
          >
            <span className="mt-0.5 shrink-0 text-muted-foreground">{c.icone}</span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold">{c.titulo}</h3>
              <p className="text-sm text-muted-foreground">{c.texto}</p>
            </div>
            <ArrowUpRight aria-hidden className="mt-1 size-4 shrink-0 text-foreground/30" />
          </a>
        ))}
      </div>
    </section>
  );
}
