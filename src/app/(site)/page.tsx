import type { Metadata } from "next";
import Link from "next/link";
import { PainelCasa } from "@/components/home/PainelCasa";
import type { CapitalMinimoPorRobo } from "@/components/home/tipos";
import { CorpoPagina } from "@/components/sistema/Pagina";
import { buttonVariants } from "@/components/ui/button";
import { capitaisDaCasa } from "@/lib/consultas/capital";
import { carregarCasa } from "@/lib/consultas/casa";

// Estatísticas pesadas com cache de 60s; o que é de hoje chega ao vivo no cliente.
export const revalidate = 60;

export const metadata: Metadata = {
  openGraph: {
    title: "Quants Robôs · Performance ao vivo",
    description: "Resultado ao vivo dos robôs de day trade, direto do MetaTrader 5, sempre para 1 contrato por entrada.",
    images: [{ url: "/api/og/casa", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

/**
 * A página inicial, "Visão geral" (ficha Mesa; DESIGN.md, seção 9). É uma tela só: o resultado somado dos
 * robôs em número grande, a curva com a maior queda em vermelho e a lista dos robôs, que é a comparação
 * entre eles e também o controle da curva. Sem título de marketing, sem caixas, sem seções de comunidade: o
 * Lucas aprovou a estrutura do sistema e mandou tirar do miolo o que não era necessário.
 *
 * 25/11/2026: a página "Comparar robôs" deixou de existir (/comparativo redireciona para cá, no
 * next.config.ts). A lista ganhou as colunas que decidem (resultado, maior queda, ganho para cada R$ 1 da
 * maior queda e capital mínimo) e a curva, a opção "Lado a lado".
 *
 * O que saiu daqui continua no site: "como começar" e as perguntas estão em Como funciona; os canais, no
 * rodapé e no botão da barra lateral. No celular, onde não há barra lateral, o botão "Como começar" vem no
 * fim da lista de robôs.
 *
 * Os dados vêm do carregarCasa (com cache por requisição): o layout do site usa os mesmos para a barra
 * lateral e a fita, e é ele quem assina o ao vivo. O capital mínimo vem de capitaisDaCasa, que reaproveita
 * o que o carregarCasa já leu e é a mesma conta do robô e do simulador; para o navegador desce só o número.
 */
export default async function Home() {
  const [casa, capitais] = await Promise.all([carregarCasa(), capitaisDaCasa()]);
  const { links } = casa.parametros;
  const capitalMinimo: CapitalMinimoPorRobo = Object.fromEntries(Object.entries(capitais).map(([slug, c]) => [slug, c.capitalMinimo]));

  return (
    <CorpoPagina className="pt-7 lg:pt-10">
      <PainelCasa cards={casa.cards} series={casa.series} capitais={capitalMinimo} />

      <div className="lg:hidden">
        {links.whatsapp ? (
          <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" className={buttonVariants({ className: "h-11 w-full" })}>
            Como começar
          </a>
        ) : (
          <Link href="/metodologia#como-comecar" className={buttonVariants({ className: "h-11 w-full" })}>
            Como começar
          </Link>
        )}
      </div>
    </CorpoPagina>
  );
}
