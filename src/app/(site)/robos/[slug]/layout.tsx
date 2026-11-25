import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AbasRobo } from "@/components/robo/AbasRobo";
import { CabecalhoRobo } from "@/components/robo/CabecalhoRobo";
import { CorpoPagina } from "@/components/sistema/Pagina";
import { RoboAoVivoProvider } from "@/components/robo/RoboAoVivoProvider";
import { SoComColetor } from "@/components/robo/SoComColetor";
import {
  buscarRobo,
  listarExposicaoDia,
  listarFeriados,
  listarMercado,
  listarOperacoesDoDia,
  listarPosicoes,
  listarRobos,
} from "@/lib/consultas/publico";
import { capitalDoRobo } from "@/lib/consultas/capital";
import { carregarCasa } from "@/lib/consultas/casa";
import { hojeSP } from "@/lib/stats/periodos";
import { pregaoAberto } from "@/lib/stats/pregao";

// Slug novo cadastrado no banco funciona sem deploy: nada de lista fixa.
export const revalidate = 60;
export const dynamicParams = true;

/**
 * Sem generateStaticParams o Next trata a rota como dinâmica e renderiza a cada visita, ignorando
 * o revalidate (18/09/2026: 5 a 24 s por página). Com a lista, cada robô é pré-renderizado e
 * revalidado a cada 60 s; robô cadastrado depois do deploy entra na primeira visita (dynamicParams).
 */
export async function generateStaticParams() {
  const robos = await listarRobos();
  return robos.map((r) => ({ slug: r.slug }));
}

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  if (!robo) return { title: "Robô não encontrado" };
  const descricao =
    robo.descricao_publica ??
    `Performance ao vivo do robô ${robo.nome} (${robo.ativo_nome}), direto do MetaTrader 5.`;
  return {
    title: robo.nome,
    description: descricao,
    openGraph: {
      title: `${robo.nome} · Quants Robôs`,
      description: descricao,
      images: [{ url: `/api/og/${slug}`, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image" },
  };
}

/**
 * Cabeçalho, estado ao vivo e abas compartilhados por todas as páginas do robô. Desde a ficha Mesa
 * (25/11/2026) o cabeçalho e a faixa de abas ocupam a largura da área de trabalho, e cada aba desenha
 * os próprios painéis dentro do CorpoPagina. O caminho de volta mora no cabeçalho.
 *
 * O capital mínimo e as entradas abertas do cabeçalho vêm de capitalDoRobo, a mesma conta de todas as telas
 * (com cache por requisição: a aba que pedir de novo recebe o mesmo objeto).
 */
export default async function LayoutRobo({ children, params }: Props) {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  if (!robo) notFound();

  const hoje = hojeSP();
  // os links do site (o botão "Quero esse robô" do cabeçalho): a mesma leitura do layout do site, com cache
  const [casa, operacoes, posicoes, feriados, mercado, exposicao, capital] = await Promise.all([
    carregarCasa(),
    listarOperacoesDoDia(slug, hoje),
    listarPosicoes(slug),
    listarFeriados(),
    listarMercado(),
    // MEP/MEN de hoje medidos pelo EA (22/09/2026), para a aba Ao vivo
    listarExposicaoDia(slug, { dia: hoje }),
    capitalDoRobo(slug),
  ]);

  const mercadoDoAtivo = mercado.find((m) => m.prefixo_simbolo === robo.ativo);
  const pregao = mercadoDoAtivo
    ? { inicio: mercadoDoAtivo.pregao_inicio, fim: mercadoDoAtivo.pregao_fim }
    : { inicio: "09:00", fim: "18:00" };

  return (
    <article>
      <RoboAoVivoProvider
        robo={robo}
        inicial={{ operacoes, posicoes, ultimoHeartbeatEm: robo.ultimo_heartbeat_em, dia: hoje, exposicaoHoje: exposicao[0] ?? null }}
        pregao={pregao}
        feriados={feriados}
        pregaoAbertoNoServidor={pregaoAberto(new Date(), pregao, feriados)}
      >
        <CabecalhoRobo
          linkQuero={casa.parametros.links.whatsapp || undefined}
          capitalMinimo={capital?.capitalMinimo ?? null}
          // sem medição (robô só com histórico importado, sem horário de entrada) o cabeçalho não afirma nada
          entradas={capital && capital.entradasEm !== null ? capital.entradas : null}
        />
        <AbasRobo slug={slug} temColetor={robo.tem_coletor} />
        {/* a aba Ao vivo de um robô sem coletor responde 404 daqui, antes do esqueleto de carregamento */}
        <SoComColetor temColetor={robo.tem_coletor}>
          <CorpoPagina>{children}</CorpoPagina>
        </SoComColetor>
      </RoboAoVivoProvider>
    </article>
  );
}
