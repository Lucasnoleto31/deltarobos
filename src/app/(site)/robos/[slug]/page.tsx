import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CurvaCapital } from "@/components/graficos/CurvaCapital";
import { CabecalhoRobo } from "@/components/robo/CabecalhoRobo";
import { Disclaimer } from "@/components/robo/Disclaimer";
import { KpisRobo } from "@/components/robo/KpisRobo";
import { PainelHoje } from "@/components/robo/PainelHoje";
import { RoboAoVivoProvider } from "@/components/robo/RoboAoVivoProvider";
import { Transparencia } from "@/components/robo/Transparencia";
import {
  buscarRobo,
  carregarParametros,
  listarEstatisticas,
  listarFeriados,
  listarMercado,
  listarOperacoesDoDia,
  listarPosicoes,
} from "@/lib/consultas/publico";
import { hojeSP } from "@/lib/stats/periodos";

// Slug novo cadastrado no banco funciona sem deploy: nada de lista fixa.
export const revalidate = 60;
export const dynamicParams = true;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  if (!robo) return { title: "Robô não encontrado" };
  return {
    title: robo.nome,
    description:
      robo.descricao_publica ??
      `Performance ao vivo do robô ${robo.nome} (${robo.ativo_nome}), direto do MetaTrader 5.`,
  };
}

export default async function PaginaRobo({ params }: Props) {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  if (!robo) notFound();

  const hoje = hojeSP();
  const [linhas, operacoes, posicoes, feriados, mercado, parametros] = await Promise.all([
    listarEstatisticas(slug),
    listarOperacoesDoDia(slug, hoje),
    listarPosicoes(slug),
    listarFeriados(),
    listarMercado(),
    carregarParametros(),
  ]);

  const mercadoDoAtivo = mercado.find((m) => m.prefixo_simbolo === robo.ativo);
  const pregao = mercadoDoAtivo
    ? { inicio: mercadoDoAtivo.pregao_inicio, fim: mercadoDoAtivo.pregao_fim }
    : { inicio: "09:00", fim: "18:00" };

  const emBreve = robo.status === "em_breve";

  return (
    <article className="conteudo space-y-10 py-8">
      <RoboAoVivoProvider
        robo={robo}
        inicial={{ operacoes, posicoes, ultimoHeartbeatEm: robo.ultimo_heartbeat_em, dia: hoje }}
        pregao={pregao}
        feriados={feriados}
      >
        <CabecalhoRobo />
        {emBreve ? (
          <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
            Este robô ainda não começou a operar em conta real. As estatísticas aparecem aqui
            assim que a primeira operação fechar.
          </p>
        ) : (
          <PainelHoje />
        )}
      </RoboAoVivoProvider>

      {!emBreve ? (
        <>
          <section aria-labelledby="kpis" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="kpis" className="text-lg font-semibold tracking-tight">
                Estatísticas
              </h2>
              <p className="text-xs text-muted-foreground">
                Desde o início · R$ líquido por 1 contrato
              </p>
            </div>
            <KpisRobo
              linhas={linhas}
              valorPonto={robo.valor_ponto_brl}
              capitalReferencia={robo.capital_referencia}
              hoje={hoje}
            />
          </section>

          <section aria-labelledby="curva" className="space-y-3">
            <h2 id="curva" className="text-lg font-semibold tracking-tight">
              Curva de capital
            </h2>
            <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
              <CurvaCapital linhas={linhas} valorPonto={robo.valor_ponto_brl} hoje={hoje} />
            </div>
          </section>
        </>
      ) : null}

      <Transparencia robo={robo} />
      <Disclaimer
        nomeRobo={robo.nome}
        texto={parametros.textos.disclaimer}
        linkCta={parametros.links.whatsapp}
      />
    </article>
  );
}
