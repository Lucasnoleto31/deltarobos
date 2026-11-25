import type { Metadata } from "next";
import Link from "next/link";
import { PainelCasa } from "@/components/home/PainelCasa";
import { CorpoPagina } from "@/components/sistema/Pagina";
import { buttonVariants } from "@/components/ui/button";
import { carregarCasa } from "@/lib/consultas/casa";

// Estatísticas pesadas com cache de 60s; o que é de hoje chega ao vivo no cliente.
export const revalidate = 60;

export const metadata: Metadata = {
  openGraph: {
    title: "Quants Robôs · Performance ao vivo",
    description: "Resultado ao vivo dos robôs de day trade, direto do MetaTrader 5, sempre para 1 contrato.",
    images: [{ url: "/api/og/casa", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

/**
 * A página inicial, "Visão geral" (ficha Mesa, 25/11/2026, segunda passada). É uma tela só: o resultado
 * somado dos robôs em número grande, a curva com a maior queda em vermelho e a lista dos robôs, que também
 * é o controle da curva. Sem título de marketing, sem caixas, sem seções de comunidade: o Lucas aprovou a
 * estrutura do sistema e mandou tirar do miolo o que não era necessário.
 *
 * O que saiu daqui continua no site: "como começar" e as perguntas estão em Como funciona; os canais, no
 * rodapé e no botão da barra lateral. No celular, onde não há barra lateral, o botão "Como começar" vem no
 * fim da lista de robôs.
 *
 * Os dados vêm do carregarCasa (com cache por requisição): o layout do site usa os mesmos para a barra
 * lateral e a fita, e é ele quem assina o ao vivo.
 */
export default async function Home() {
  const casa = await carregarCasa();
  const { links } = casa.parametros;

  return (
    <CorpoPagina className="pt-7 lg:pt-10">
      <PainelCasa cards={casa.cards} series={casa.series} />

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
