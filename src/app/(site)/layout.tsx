import { Cabecalho } from "@/components/layout/Cabecalho";
import { Rodape } from "@/components/layout/Rodape";
import { carregarParametros, listarRobos } from "@/lib/consultas/publico";

export default async function LayoutSite({ children }: { children: React.ReactNode }) {
  const [parametros, robos] = await Promise.all([carregarParametros(), listarRobos()]);
  // o rodapé lista os mesmos robôs das abas do cabeçalho (19/09/2026)
  const robosRodape = robos.filter((r) => r.status !== "arquivado").map((r) => ({ slug: r.slug, nome: r.nome }));

  return (
    <>
      <Cabecalho links={parametros.links} />
      <main className="flex-1">{children}</main>
      <Rodape links={parametros.links} textos={parametros.textos} robos={robosRodape} />
    </>
  );
}
