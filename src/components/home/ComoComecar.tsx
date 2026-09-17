import { buttonVariants } from "@/components/ui/button";
import type { Links } from "@/lib/tipos";

interface Props {
  links: Links;
}

const PASSOS = [
  {
    titulo: "Abra sua conta no BTG",
    texto: "Pelo link do assessor. Os robôs rodam numa subconta dessa conta.",
  },
  {
    titulo: "Escolha o robô",
    texto: "Os resultados daqui são por 1 contrato e líquidos de custo.",
  },
  {
    titulo: "Libere a licença",
    texto: "A equipe configura o robô na sua conta.",
  },
];

/** Item 13 da home: como começar em 3 passos. */
export function ComoComecar({ links }: Props) {
  return (
    <section id="como-comecar" className="conteudo scroll-mt-20 py-8">
      <div className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Como começar</h2>
      </div>

      <ol className="grid gap-4 sm:grid-cols-3">
        {PASSOS.map((p, i) => (
          <li key={p.titulo} className="flex gap-4 painel p-5">
            <span className="shrink-0 text-2xl font-semibold leading-none text-primary tabular-nums">
              {i + 1}
            </span>
            <div>
              <h3 className="font-semibold">{p.titulo}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.texto}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex flex-wrap gap-3">
        {links.btg_abertura_conta ? (
          <a
            href={links.btg_abertura_conta}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: "lg" })}
          >
            Abrir conta no BTG
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
      </div>
    </section>
  );
}
