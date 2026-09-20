import { RevelarNaRolagem } from "@/components/compartilhados/RevelarNaRolagem";
import { buttonVariants } from "@/components/ui/button";
import type { Links } from "@/lib/tipos";

interface Props {
  links: Links;
}

// O passo 2 ficou só com o título (19/09/2026): o texto repetia a convenção do hero ("por 1 contrato e
// líquidos de custo") e não ajudava a escolher. No mesmo dia os três cartões viraram um painel com
// colunas separadas por fio, como o bloco de capital da aba Risco: o cartão vazio do passo 2 destoava
// entre dois cheios. Também em 19/09/2026 a corretora deixou de ser citada pelo nome (identidade Quants);
// a chave links.btg_abertura_conta é interna e continua a mesma.
const PASSOS: { titulo: string; texto?: string }[] = [
  {
    titulo: "Abra sua conta na corretora parceira",
    texto: "Pelo link do assessor. Os robôs rodam numa subconta dessa conta.",
  },
  {
    titulo: "Escolha o robô",
  },
  {
    titulo: "Libere a licença",
    texto: "A equipe configura o robô na sua conta.",
  },
];

/** Item 13 da home: como começar em 3 passos. */
export function ComoComecar({ links }: Props) {
  return (
    // o scroll-mt-20 saiu em 19/09/2026: quem desconta o cabeçalho é o scroll-padding-top do html
    <section id="como-comecar" className="conteudo py-8">
      <RevelarNaRolagem className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Como começar</h2>
      </RevelarNaRolagem>

      <ol className="painel grid sm:grid-cols-3">
        {PASSOS.map((p, i) => (
          // 19/09/2026: os passos entram um a um, mas quem sobe é o CONTEÚDO, não o <li>. O fio que
          // separa as colunas é a borda do <li>: levando ele junto, os fios saíam do lugar por meio
          // segundo enquanto o painel ficava parado. O padding mudou de lugar pelo mesmo motivo.
          <li
            key={p.titulo}
            className="border-(--painel-fio) not-first:border-t sm:not-first:border-t-0 sm:not-first:border-l"
          >
            <RevelarNaRolagem className="flex gap-4 p-5" indice={i} desloca={8}>
              <span className="shrink-0 text-2xl font-semibold leading-none text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold">{p.titulo}</h3>
                {p.texto ? <p className="mt-1 text-sm text-muted-foreground">{p.texto}</p> : null}
              </div>
            </RevelarNaRolagem>
          </li>
        ))}
      </ol>

      <RevelarNaRolagem className="mt-5 flex flex-wrap gap-3" indice={PASSOS.length}>
        {links.btg_abertura_conta ? (
          <a
            href={links.btg_abertura_conta}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: "lg" })}
          >
            Abrir conta na corretora parceira
          </a>
        ) : null}
        {links.whatsapp ? (
          <a
            href={links.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: "lg", variant: "outline" })}
          >
            Falar com a equipe
          </a>
        ) : null}
      </RevelarNaRolagem>
    </section>
  );
}
