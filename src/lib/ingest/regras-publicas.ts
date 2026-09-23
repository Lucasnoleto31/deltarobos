import { z } from "zod";

/**
 * Regras públicas por magic que o EA 1.1.1 recebe no GET /api/ingest/ping e aplica ao medir a exposição do
 * dia (MEP/MEN, exposicao_dia). São as MESMAS regras de operacoes_publico (spec §7; migrations 0016, 0018 e
 * 0019): operação aberta antes de robos.hora_minima_operacao, ou mais curta que robos.duracao_minima_seg a
 * partir de robos.duracao_minima_desde, fica fora do site. Até o 1.1.0 o EA media o saldo REAL do magic
 * (tudo incluído), o MEP saía com ganho fantasma e exposicao_dia_publico descartava o dia inteiro.
 * Fuso das regras: America/Sao_Paulo (a hora mínima é de Brasília). Nunca leva numero_conta.
 *
 * As linhas vêm da função regras_publicas_da_conta (migration 0023), que já filtra pela conta principal e
 * calcula a "versao" da regra com a mesma função que a view exposicao_dia_publico usa para conferir o que o
 * EA ecoa em cada item de exposicao_dia (regras_versao). A versão é opaca para o EA e para este módulo.
 */
export interface RegraMagic {
  magic: number;
  slug: string;
  /** "HH:MM" em Brasília ("HH:MM:SS" só se a hora cadastrada tiver segundos); null = sem hora mínima */
  hora_minima: string | null;
  /** duração mínima em segundos; null = sem corte */
  duracao_minima_seg: number | null;
  /** primeiro pregão (YYYY-MM-DD) em que a duração mínima vale; null = sempre (ou sem duração mínima) */
  duracao_minima_desde: string | null;
  /** versão da regra calculada no banco (regras_publicas_versao); o EA ecoa em exposicao_dia.regras_versao */
  versao: string;
}

/** Função do banco que a rota chama (service_role): um item por magic da conta cujo robô a tem como principal. */
export const RPC_REGRAS = "regras_publicas_da_conta";

const magic = z.union([
  z.number().int().nonnegative(),
  // int8 pode vir como texto dependendo da serialização; nunca como número quebrado
  z.string().regex(/^[0-9]{1,18}$/).transform(Number),
]);

/** Uma linha como regras_publicas_da_conta devolve (colunas cruas do robô + versão). */
const linha = z.object({
  magic,
  slug: z.string().trim().min(1),
  conta_principal_id: z.string().nullish(),
  hora_minima_operacao: z.string().nullish(),
  duracao_minima_seg: z.number().int().nullish(),
  duracao_minima_desde: z.string().nullish(),
  versao: z.string().min(1).max(120),
});

const HORA = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** "09:10:00" (time do Postgres) -> "09:10"; segundos só ficam quando não são zero. Inválida = sem regra. */
export function normalizarHoraMinima(valor: string | null | undefined): string | null {
  if (valor == null) return null;
  const m = HORA.exec(valor.trim());
  if (!m) {
    console.warn(`[ingest/ping] hora_minima_operacao ignorada: ${JSON.stringify(valor)}`);
    return null;
  }
  const [, hh, mm, ss] = m;
  return ss && ss !== "00" ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

/**
 * Monta a lista de regras a partir das linhas cruas de regras_publicas_da_conta. A função do banco já só
 * devolve magics cujo robô tem esta conta como conta_principal_id; o filtro aqui é redundante de propósito
 * (o EA de uma conta secundária nunca pode receber regra, como o site também não publica nada dela). Um
 * robô sem regra continua na lista, com nulos: assim o EA sabe que a regra foi removida e não fica com a
 * última conhecida. Linha malformada (inclusive sem versão) é ignorada com aviso.
 * Ordem: slug, magic (estável para log e teste).
 */
export function montarRegras(linhas: unknown, contaId: string): RegraMagic[] {
  if (!Array.isArray(linhas)) return [];
  const regras: RegraMagic[] = [];
  for (const bruta of linhas) {
    const r = linha.safeParse(bruta);
    if (!r.success) {
      console.warn(`[ingest/ping] linha de regra ignorada: ${r.error.issues[0]?.message ?? "inválida"}`);
      continue;
    }
    if (r.data.conta_principal_id !== contaId) continue;

    const duracao = r.data.duracao_minima_seg != null && r.data.duracao_minima_seg > 0 ? r.data.duracao_minima_seg : null;
    const desde =
      duracao != null && r.data.duracao_minima_desde && DIA.test(r.data.duracao_minima_desde) ? r.data.duracao_minima_desde : null;

    regras.push({
      magic: r.data.magic,
      slug: r.data.slug,
      hora_minima: normalizarHoraMinima(r.data.hora_minima_operacao),
      duracao_minima_seg: duracao,
      duracao_minima_desde: desde,
      versao: r.data.versao,
    });
  }
  regras.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : a.magic - b.magic));
  return regras;
}
