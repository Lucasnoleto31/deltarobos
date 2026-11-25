import { CasaAoVivoProvider } from "@/components/home/CasaAoVivoProvider";
import type { RoboBase } from "@/components/home/useRobosAoVivo";
import { ConteudoLateral } from "@/components/layout/BarraLateral";
import { BarraInferior } from "@/components/layout/BarraInferior";
import { BarraTopo } from "@/components/layout/BarraTopo";
import { Rodape } from "@/components/layout/Rodape";
import { carregarCasa } from "@/lib/consultas/casa";
import { custosDaSoma } from "@/lib/premissa";

/**
 * A casca do sistema (ficha Mesa, 25/11/2026): barra lateral fixa com as áreas e os robôs, fita de mercado
 * no topo e a área de trabalho ocupando o resto da tela. O ao vivo da casa (topic "casa") é assinado aqui,
 * uma vez, e vale para a barra lateral, a fita e a página inicial: antes era só da home.
 *
 * A barra lateral recebe de cada robô só o que mostra (nome, estado e o número do dia); o card inteiro, com a
 * curva, fica com a página inicial.
 *
 * A nota "Todos os valores são para 1 contrato por entrada, ..." da barra lateral e da folha de robôs do
 * celular diz os custos de todos os robôs que têm números no site (os com histórico, fora os "em breve"),
 * pela regra de lib/premissa: o robô cujo histórico não tem custo cadastrado entra como ressalva, pelo nome.
 */
export default async function LayoutSite({ children }: { children: React.ReactNode }) {
  const casa = await carregarCasa();
  const custos = custosDaSoma(
    casa.cards
      .filter((c) => c.status !== "em_breve" && c.ultimoPregao !== null)
      .map((c) => ({ nome: c.nome, custoPorContrato: c.custoPorContrato })),
  );
  const robosDaLateral: RoboBase[] = casa.cards.map((c) => ({
    slug: c.slug,
    nome: c.nome,
    ativo: c.ativo,
    status: c.status,
    horarioInicio: c.horarioInicio,
    horarioFim: c.horarioFim,
    posicionado: c.posicionado,
    nPosicoesAbertas: c.nPosicoesAbertas,
    ultimoHeartbeatEm: c.ultimoHeartbeatEm,
    temColetor: c.temColetor,
    hoje: c.hoje,
  }));

  return (
    <CasaAoVivoProvider
      inicial={{ resumo: casa.resumo, mercado: casa.mercado, coleta: casa.coleta }}
      feriados={casa.feriados}
      hoje={casa.hoje}
      pregaoAbertoNoServidor={casa.pregaoAbertoNoServidor}
    >
      <div className="casca">
        <aside className="lateral hidden lg:flex">
          <ConteudoLateral robos={robosDaLateral} links={casa.parametros.links} custos={custos} />
        </aside>
        {/* no celular a barra de navegação fica presa embaixo: o conteúdo guarda o lugar dela */}
        <div className="flex min-w-0 flex-col pb-[calc(3.25rem+env(safe-area-inset-bottom))] lg:pb-0">
          <BarraTopo />
          <main className="flex-1">{children}</main>
          <Rodape links={casa.parametros.links} textos={casa.parametros.textos} />
          <BarraInferior robos={robosDaLateral} links={casa.parametros.links} custos={custos} />
        </div>
      </div>
    </CasaAoVivoProvider>
  );
}
