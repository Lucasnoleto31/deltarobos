import Link from "next/link";
import { LINK_DO_PAINEL, Painel } from "@/components/sistema/Painel";
import { buttonVariants } from "@/components/ui/button";
import type { Links } from "@/lib/tipos";

interface Props {
  links: Links;
  className?: string;
}

// 19/09/2026: a corretora deixou de ser citada pelo nome (identidade Quants); a chave
// links.btg_abertura_conta é interna e continua a mesma.
// 20/09/2026, correção do Artur sobre como o produto funciona de verdade: (1) o robô roda numa conta
// DESSA corretora, não numa subconta; (3) a equipe NÃO instala — libera a licença e ajuda com
// treinamento, e a instalação no MetaTrader 5 é do cliente (a equipe só entra quando ele não consegue).
// 25/11/2026 (revisão das telas, DESIGN.md seção 9): o passo 2 aponta para onde a escolha se faz hoje: a
// lista da Visão geral (resultado, maior queda e capital mínimo de cada robô) e Simular meu capital. Não
// existe mais a tela "Comparar robôs".
const PASSOS: { titulo: string; texto: React.ReactNode }[] = [
  {
    titulo: "Abra sua conta na corretora parceira",
    texto: "Pelo link do assessor. O robô roda numa conta dessa corretora.",
  },
  {
    titulo: "Escolha o robô",
    texto: (
      <>
        A{" "}
        <Link href="/" className={LINK_DO_PAINEL}>
          Visão geral
        </Link>{" "}
        mostra o resultado, a maior queda e o capital mínimo de cada um. Em{" "}
        <Link href="/simulador" className={LINK_DO_PAINEL}>
          Simular meu capital
        </Link>{" "}
        você vê se o seu capital cabe.
      </>
    ),
  },
  {
    titulo: "Instale e libere a licença",
    texto: "A instalação no MetaTrader 5 é sua. A equipe libera a licença e ajuda com treinamento.",
  },
];

/**
 * O link de abertura de conta na corretora parceira (Genial), com o código do assessor, passado pelo
 * Artur em 20/09/2026. A chave do banco (`links.btg_abertura_conta`) está vazia e o nome dela é de
 * antes da troca de corretora — por isso o padrão mora aqui; assim que o Lucas preencher a chave
 * (scripts/textos-quants.sql), o valor do banco manda. O texto na tela não cita a corretora pelo nome.
 */
const ABERTURA_DE_CONTA_PADRAO = "https://app.genialinvestimentos.com.br/abrir-conta?idAssessor=14253";

/** O link de abertura de conta: o do banco, ou o padrão enquanto a chave estiver vazia. */
export function linkAberturaDeConta(links: Links): string {
  return links.btg_abertura_conta || ABERTURA_DE_CONTA_PADRAO;
}

/**
 * Como começar, em três passos (ficha Mesa, 25/11/2026). Saiu da página inicial (o Lucas mandou tirar o que
 * não era necessário ali) e mora no alto de "Como funciona"; o botão "Como começar" da barra lateral e o
 * rodapé levam ao mesmo lugar.
 *
 * 25/11/2026, revisão das telas: os passos são linhas com fio, uma embaixo da outra (o número, o que fazer e
 * a explicação ao lado), como as outras listas do site. Eram três blocos iguais lado a lado, que a ficha não
 * quer (DESIGN.md, seção 8). No celular a explicação desce para baixo do título.
 */
export function ComoComecar({ links, className }: Props) {
  return (
    <Painel id="como-comecar" titulo="Como começar" apoio="três passos" corpo="" className={className}>
      <ol>
        {PASSOS.map((p, i) => (
          <li
            key={p.titulo}
            className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-(--painel-fio) py-3.5 text-sm md:grid-cols-[1.25rem_19rem_minmax(0,1fr)] md:gap-x-6"
          >
            <span aria-hidden className="text-sutil">
              {i + 1}
            </span>
            <h3 className="font-medium">{p.titulo}</h3>
            <p className="col-start-2 max-w-3xl leading-relaxed text-pretty text-muted-foreground md:col-start-3">{p.texto}</p>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <a href={linkAberturaDeConta(links)} target="_blank" rel="noopener noreferrer" className={buttonVariants({ className: "h-9" })}>
          Abrir conta na corretora parceira
        </a>
        {links.whatsapp ? (
          <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" className={`${LINK_DO_PAINEL} text-sm`}>
            Falar com a equipe
          </a>
        ) : null}
      </div>
    </Painel>
  );
}
