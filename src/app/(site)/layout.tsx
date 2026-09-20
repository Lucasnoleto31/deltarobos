import { Cabecalho } from "@/components/layout/Cabecalho";
import { Rodape } from "@/components/layout/Rodape";
import { carregarParametros, listarRobos } from "@/lib/consultas/publico";

export default async function LayoutSite({ children }: { children: React.ReactNode }) {
  const [parametros, robos] = await Promise.all([carregarParametros(), listarRobos()]);
  // cabeçalho e rodapé listam os mesmos robôs, sem os arquivados: uma busca só, aqui (19/09/2026)
  const robosNav = robos.filter((r) => r.status !== "arquivado").map((r) => ({ slug: r.slug, nome: r.nome }));

  return (
    <>
      <Cabecalho links={parametros.links} robos={robosNav} />
      {/* 20/09/2026: a partir de xl a navegação é a barra lateral fixa do Cabecalho. Como ela é fixa,
          quem abre espaço é este recuo — o mesmo --largura-barra do globals.css, para os dois não
          divergirem. O .conteudo continua centralizado no que sobra. O #principal é o alvo do "Pular
          para o conteúdo"; o tabIndex é o que faz o foco parar aqui, e não só a rolagem. */}
      <div className="flex flex-1 flex-col xl:pl-(--largura-barra)">
        <main id="principal" tabIndex={-1} className="flex-1">
          {children}
        </main>
        <Rodape links={parametros.links} textos={parametros.textos} robos={robosNav} />
      </div>
    </>
  );
}
