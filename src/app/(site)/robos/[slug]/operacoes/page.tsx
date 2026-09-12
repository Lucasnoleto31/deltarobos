import type { Metadata } from "next";
import { BotaoCsv } from "@/components/operacoes/BotaoCsv";
import { FiltrosOperacoes } from "@/components/operacoes/FiltrosOperacoes";
import { Paginacao } from "@/components/operacoes/Paginacao";
import { TabelaOperacoes } from "@/components/operacoes/TabelaOperacoes";
import { listarOperacoes, type FiltroLado, type FiltroResultado } from "@/lib/consultas/operacoes";
import { buscarRobo } from "@/lib/consultas/publico";
import { formatarNumero } from "@/lib/formato";
import { ehDia, hojeSP } from "@/lib/stats/periodos";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  return { title: robo ? `${robo.nome} · Operações` : "Operações" };
}

function primeiro(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Aba Operações: tabela completa paginada, filtros na URL, CSV e realtime nas de hoje. */
export default async function PaginaOperacoes({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const hoje = hojeSP();

  const de = ehDia(primeiro(sp.de)) ? (primeiro(sp.de) as string) : null;
  const ate = ehDia(primeiro(sp.ate)) ? (primeiro(sp.ate) as string) : null;
  const ladoBruto = primeiro(sp.lado);
  const lado: FiltroLado | null = ladoBruto === "compra" || ladoBruto === "venda" ? ladoBruto : null;
  const resBruto = primeiro(sp.resultado);
  const resultado: FiltroResultado | null = resBruto === "gain" || resBruto === "loss" ? resBruto : null;
  const paginaBruta = Number.parseInt(primeiro(sp.pagina) ?? "1", 10);
  const pagina = Number.isFinite(paginaBruta) && paginaBruta > 0 ? paginaBruta : 1;

  const filtros = { de, ate, lado, resultado };
  const dados = await listarOperacoes(slug, { ...filtros, pagina });
  const semFiltro = !de && !ate && !lado && !resultado;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Operações</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatarNumero(dados.total)} {dados.total === 1 ? "operação" : "operações"}
            {semFiltro ? " no total" : " com o filtro atual"} · valores por 1 contrato
          </p>
        </div>
        <BotaoCsv slug={slug} filtros={filtros} total={dados.total} />
      </div>

      <FiltrosOperacoes slug={slug} filtros={filtros} hoje={hoje} />

      <TabelaOperacoes itens={dados.itens} slug={slug} dia={hoje} aoVivo={pagina === 1 && semFiltro} />

      <Paginacao slug={slug} filtros={filtros} pagina={dados.pagina} paginas={dados.paginas} />
    </div>
  );
}
