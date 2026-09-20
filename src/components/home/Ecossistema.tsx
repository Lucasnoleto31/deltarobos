import { ArrowUpRight, Gift, GraduationCap, LineChart } from "lucide-react";
import { RevelarNaRolagem } from "@/components/compartilhados/RevelarNaRolagem";
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
      texto: "Cursos e mentorias da Quants.",
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
    // o scroll-mt-20 saiu em 19/09/2026: quem desconta o cabeçalho é o scroll-padding-top do html
    <section id="ecossistema" className="conteudo py-8">
      <RevelarNaRolagem className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Ecossistema Quants</h2>
      </RevelarNaRolagem>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c, i) => (
          // o elemento revelado é o filho da grade; o h-full no <a> é o que mantinha os três cartões
          // com a mesma altura, que antes vinha de o <a> ser o próprio item da grade (19/09/2026)
          <RevelarNaRolagem key={c.titulo} indice={i}>
            <a
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-full items-start gap-3 painel p-5 painel-interativo painel-eleva"
            >
              <span className="mt-0.5 shrink-0 text-muted-foreground">{c.icone}</span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{c.titulo}</h3>
                <p className="text-sm text-muted-foreground">{c.texto}</p>
              </div>
              <ArrowUpRight aria-hidden className="mt-1 size-4 shrink-0 text-foreground/30" />
            </a>
          </RevelarNaRolagem>
        ))}
      </div>
    </section>
  );
}
