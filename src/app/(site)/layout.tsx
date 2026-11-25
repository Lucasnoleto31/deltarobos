import { CasaAoVivoProvider } from "@/components/home/CasaAoVivoProvider";
import type { RoboBase } from "@/components/home/useRobosAoVivo";
import { ConteudoLateral } from "@/components/layout/BarraLateral";
import { BarraInferior } from "@/components/layout/BarraInferior";
import { BarraTopo } from "@/components/layout/BarraTopo";
import { Rodape } from "@/components/layout/Rodape";
import { carregarCasa } from "@/lib/consultas/casa";

/**
 * A casca do sistema (ficha Mesa, 25/11/2026): barra lateral fixa com as áreas e os robôs, fita de mercado
 * no topo e a área de trabalho ocupando o resto da tela. O ao vivo da casa (topic "casa") é assinado aqui,
 * uma vez, e vale para a barra lateral, a fita e a página inicial: antes era só da home.
 *
 * A barra lateral recebe de cada robô só o que mostra (nome, estado e os números do dia e do mês); o card
 * inteiro, com a curva, fica com a página inicial.
 */
export default async function LayoutSite({ children }: { children: React.ReactNode }) {
  const casa = await carregarCasa();
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
    mes: c.mes,
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
          <ConteudoLateral robos={robosDaLateral} links={casa.parametros.links} />
        </aside>
        {/* no celular a barra de navegação fica presa embaixo: o conteúdo guarda o lugar dela */}
        <div className="flex min-w-0 flex-col pb-[calc(3.25rem+env(safe-area-inset-bottom))] lg:pb-0">
          <BarraTopo />
          <main className="flex-1">{children}</main>
          <Rodape links={casa.parametros.links} textos={casa.parametros.textos} />
          <BarraInferior robos={robosDaLateral} links={casa.parametros.links} />
        </div>
      </div>
    </CasaAoVivoProvider>
  );
}
