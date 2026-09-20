import { RevelarNaRolagem } from "@/components/compartilhados/RevelarNaRolagem";
import { buttonVariants } from "@/components/ui/button";
import type { Links } from "@/lib/tipos";

interface Props {
  links: Links;
}

// 19/09/2026: os três cartões viraram um painel com colunas separadas por fio, como o bloco de capital
// da aba Risco, e a corretora deixou de ser citada pelo nome (identidade Quants) — a chave
// links.btg_abertura_conta é interna e continua a mesma.
// 20/09/2026: o passo 2 tinha ficado sem texto e o Artur viu o cartão vazio na tela. A frase de antes
// repetia a convenção do hero ("por 1 contrato e líquidos de custo"); esta diz onde está o que serve
// para escolher — as abas que cada robô tem — em vez de repetir o título.
// 20/09/2026, correção dele sobre como o produto funciona de verdade: (1) o robô roda numa conta
// DESSA corretora, não numa subconta; (3) a equipe NÃO instala — libera a licença e ajuda com
// treinamento, e a instalação no MetaTrader 5 é do cliente (a equipe só entra quando ele não consegue).
const PASSOS: { titulo: string; texto: string }[] = [
  {
    titulo: "Abra sua conta na corretora parceira",
    texto: "Pelo link do assessor. O robô roda numa conta dessa corretora.",
  },
  {
    titulo: "Escolha o robô",
    texto: "Cada robô tem página própria, com desempenho, risco e todas as operações.",
  },
  {
    titulo: "Instale e libere a licença",
    texto: "A instalação no MetaTrader 5 é sua. A equipe libera a licença e ajuda com treinamento.",
  },
];

/**
 * O link de abertura de conta na corretora parceira (Genial), com o código do assessor, passado pelo
 * Artur em 20/09/2026. A chave do banco (`links.btg_abertura_conta`) está vazia e o nome dela é de
 * antes da troca de corretora — por isso o padrão mora aqui: o botão funciona no próximo deploy, e
 * assim que o Lucas preencher a chave (scripts/textos-quants.sql), o valor do banco manda.
 * O texto na tela não cita a corretora pelo nome, como o Artur pediu na troca de marca.
 */
const ABERTURA_DE_CONTA_PADRAO = "https://app.genialinvestimentos.com.br/abrir-conta?idAssessor=14253";

/** Item 13 da home: como começar em 3 passos. */
export function ComoComecar({ links }: Props) {
  const aberturaDeConta = links.btg_abertura_conta || ABERTURA_DE_CONTA_PADRAO;

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
                <p className="mt-1 text-sm text-muted-foreground">{p.texto}</p>
              </div>
            </RevelarNaRolagem>
          </li>
        ))}
      </ol>

      <RevelarNaRolagem className="mt-5 flex flex-wrap gap-3" indice={PASSOS.length}>
        <a
          href={aberturaDeConta}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ size: "lg" })}
        >
          Abrir conta na corretora parceira
        </a>
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
