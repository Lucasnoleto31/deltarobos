import { cn } from "cn";

/**
 * Uma seção da área de trabalho (ficha Mesa, 25/11/2026, segunda passada): título à esquerda, uma linha de
 * apoio ao lado, a ação à direita e o conteúdo embaixo. NÃO tem caixa: fica direto sobre o fundo, e o que
 * separa uma seção da outra é o espaço. Chamava-se Painel quando era um retângulo com borda; o nome ficou
 * para não mexer em quem chama.
 *
 * `fio` desenha o fio debaixo do título (padrão). Tire-o (`fio={false}`) quando o conteúdo já começa com um
 * fio próprio ou é um gráfico. `corpo` são as classes do miolo (padrão: `pt-4`).
 */
export function Painel({
  titulo,
  apoio,
  acao,
  children,
  className,
  corpo = "pt-4",
  fio = true,
  id,
  como: Tag = "section",
}: {
  titulo?: React.ReactNode;
  apoio?: React.ReactNode;
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  corpo?: string;
  fio?: boolean;
  id?: string;
  como?: "section" | "div" | "article" | "aside";
}) {
  const idTitulo = id ? `${id}-titulo` : undefined;
  return (
    <Tag id={id} aria-labelledby={titulo && idTitulo ? idTitulo : undefined} className={cn("painel flex flex-col", className)}>
      {titulo || acao ? (
        <header className={cn("painel-topo", !fio && "border-b-0 pb-0")}>
          {titulo ? (
            <h2 id={idTitulo} className="painel-nome">
              {titulo}
            </h2>
          ) : null}
          {apoio ? <p className="painel-apoio min-w-0">{apoio}</p> : null}
          {acao ? <div className="ml-auto flex min-w-0 flex-wrap items-center gap-4 text-[0.8125rem]">{acao}</div> : null}
        </header>
      ) : null}
      <div className={cn("min-w-0 flex-1", corpo)}>{children}</div>
    </Tag>
  );
}

/** Link discreto de ação no cabeçalho da seção ("Ver tudo", "Lista completa"): texto com fio embaixo. */
export const LINK_DO_PAINEL =
  "border-b border-(--painel-fio-forte) text-muted-foreground transition-colors hover:border-foreground hover:text-foreground";
