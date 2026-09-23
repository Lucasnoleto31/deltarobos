import { z } from "zod";

/** ENUM_DEAL_TYPE do MT5, na ordem numérica (0..17) */
export const TIPOS_DEAL = [
  "buy",
  "sell",
  "balance",
  "credit",
  "charge",
  "correction",
  "bonus",
  "commission",
  "commission_daily",
  "commission_monthly",
  "commission_agent_daily",
  "commission_agent_monthly",
  "interest",
  "buy_canceled",
  "sell_canceled",
  "dividend",
  "dividend_franked",
  "tax",
] as const;

/** ENUM_DEAL_ENTRY do MT5, na ordem numérica (0..3) */
export const ENTRIES_DEAL = ["in", "out", "inout", "out_by"] as const;

export type TipoDeal = (typeof TIPOS_DEAL)[number];
export type EntryDeal = (typeof ENTRIES_DEAL)[number];

// Aceita texto ou o código numérico do MT5
const tipoDeal = z.union([
  z.enum(TIPOS_DEAL),
  z
    .number()
    .int()
    .min(0)
    .max(TIPOS_DEAL.length - 1)
    .transform((n) => TIPOS_DEAL[n]),
]);

const entryDeal = z.union([
  z.enum(ENTRIES_DEAL),
  z
    .number()
    .int()
    .min(0)
    .max(ENTRIES_DEAL.length - 1)
    .transform((n) => ENTRIES_DEAL[n]),
]);

// Lado de posição: aceita pt-BR, en ou código (0 = buy, 1 = sell)
const lado = z.union([
  z.enum(["compra", "venda"]),
  z.enum(["buy", "sell"]).transform((v) => (v === "buy" ? "compra" : "venda")),
  z
    .number()
    .int()
    .min(0)
    .max(1)
    .transform((n) => (n === 0 ? "compra" : "venda")),
]);

// ISO 8601 com offset/Z, ou epoch em segundos UTC
const dataIso = z.union([
  z.iso.datetime({ offset: true }),
  z
    .number()
    .int()
    .positive()
    .transform((n) => new Date(n * 1000).toISOString()),
]);

const simbolo = z.string().trim().min(1).max(32);

/** Dia de pregão YYYY-MM-DD (dia do servidor do MT5, que o EA já manda em Brasília). */
const diaIso = z.iso.date();

/**
 * Campo novo do EA 1.1.0 que nunca pode derrubar o corpo: ausente vira undefined (EA 1.0.0 continua
 * aceito) e malformado TAMBÉM vira undefined, com um aviso no log. Um 400 tiraria o deal da fila do EA
 * (Http() desiste em 400) e o deal seria perdido por causa de um campo acessório.
 */
function tolerante<T extends z.ZodType>(nome: string, schema: T) {
  return schema.optional().catch((ctx) => {
    const motivo = ctx.issues[0]?.message ?? "valor inválido";
    console.warn(`[ingest] campo ${nome} ignorado: ${motivo}`);
    return undefined;
  });
}

/**
 * Excursão da posição medida pelo EA (MFE/MAE em pontos por contrato, tick a tick). Vai junto do deal
 * e de cada posição do heartbeat. Só existe a partir do EA 1.1.0.
 */
const camposExcursao = {
  ciclo: tolerante("ciclo", z.number().int().positive()),
  mfe_pontos: tolerante("mfe_pontos", z.number().nonnegative()),
  mae_pontos: tolerante("mae_pontos", z.number().nonpositive()),
  excursao_parcial: tolerante("excursao_parcial", z.boolean()),
};

export const dealSchema = z.object({
  ticket: z.number().int().positive(),
  posicao_id: z.number().int().nonnegative().default(0),
  ordem: z.number().int().nonnegative().optional(),
  simbolo,
  tipo: tipoDeal,
  entry: entryDeal,
  volume: z.number().nonnegative(),
  preco: z.number().nonnegative(),
  lucro: z.number().default(0),
  comissao: z.number().default(0),
  swap: z.number().default(0),
  magic: z.number().int().nonnegative().default(0),
  executado_em: dataIso,
  comentario: z.string().max(200).nullish(),
  // EA 1.1.0: excursão do ciclo da posição que este deal pertence (só quando o EA conhece)
  ...camposExcursao,
  mfe_em: tolerante("mfe_em", dataIso),
  mae_em: tolerante("mae_em", dataIso),
});

export const corpoDealSchema = z.object({
  ea_versao: z.string().max(32).optional(),
  deal: dealSchema,
});

export const posicaoSchema = z.object({
  ticket: z.number().int().positive(),
  simbolo,
  lado,
  magic: z.number().int().nonnegative().default(0),
  volume: z.number().positive(),
  preco_abertura: z.number().nonnegative(),
  lucro_flutuante: z.number().default(0),
  aberta_em: dataIso.optional(),
  // EA 1.1.0: POSITION_IDENTIFIER (igual ao ticket em conta netting) e excursão do ciclo atual
  posicao_id: tolerante("posicao_id", z.number().int().positive()),
  ...camposExcursao,
});

/**
 * MEP/MEN do dia por magic medidos pelo EA tick a tick (R$ brutos por contrato: realizado do dia + flutuante
 * das posições do magic). mep_em/men_em faltam quando o extremo nunca saiu do zero.
 */
export const exposicaoDiaSchema = z.object({
  magic: z.number().int().nonnegative(),
  dia: diaIso,
  realizado: z.number().default(0),
  flutuante: z.number().default(0),
  n_saidas: z.number().int().nonnegative().default(0),
  mep: z.number().nonnegative().default(0),
  mep_em: dataIso.nullish(),
  mep_n_saidas: z.number().int().nonnegative().nullish(),
  men: z.number().nonpositive().default(0),
  men_em: dataIso.nullish(),
  men_n_saidas: z.number().int().nonnegative().nullish(),
  parcial: z.boolean().default(false),
  // EA 1.1.1: true quando o EA tinha a regra pública do magic (GET /api/ingest/ping) ao calcular o dia, isto
  // é, mediu MEP/MEN só sobre o que o site publica. Ausente (1.1.0) ou malformado vira undefined e o banco
  // grava false (migration 0023); nunca derruba a exposição nem o heartbeat.
  regras_aplicadas: tolerante("regras_aplicadas", z.boolean()),
  // EA 1.1.1: versão da regra aplicada, ecoada do ping (texto opaco, calculado por regras_publicas_versao no
  // banco). A view só publica a linha cuja versão bate com a regra atual do robô, e o banco substitui a linha
  // quando a versão muda. Ausente ou malformada vira undefined (o banco grava nula: a linha fica fora da
  // view até chegar um item com versão).
  regras_versao: tolerante("regras_versao", z.string().min(1).max(120)),
});

export const cotacaoSchema = z.object({
  simbolo,
  preco: z.number().positive(),
  fechamento_anterior: z.number().nonnegative().nullish(),
});

/**
 * Balde da série do saldo do dia (EA 1.1.2): [t, min, max, ultimo]. t = início do balde em epoch UTC (segundos,
 * inteiro); min/max/ultimo = mínimo, máximo e último valor do saldo do dia do magic (realizado + flutuante) dentro
 * do balde, em R$ BRUTOS por contrato com 4 casas: o mesmo valor que alimenta o MEP/MEN de exposicao_dia.
 * t < 1e11 (ano 5138): epoch em MILISSEGUNDOS (EA com bug) cai aqui como balde malformado, com aviso no log, em vez
 * de passar e sumir em silêncio no banco (que também filtra t < 1e11).
 */
export const baldeSaldoSchema = z.tuple([
  z.number().int().positive().lt(100_000_000_000),
  z.number(),
  z.number(),
  z.number(),
]);

/** Teto de baldes por item: o buffer circular do EA (InpSaldoBucketSeg = 1 s por 12 min, ou 5 s por 1 h). */
export const MAX_BALDES_SALDO_DIA = 720;

/** Teto de itens (magic, dia, regras) de saldo_dia por heartbeat; o EA envia só o que cabe e guarda o resto. */
export const MAX_ITENS_SALDO_DIA = 50;

/**
 * Item de saldo_dia do heartbeat (EA 1.1.2): os baldes fechados e ainda não confirmados de um magic. Diferente da
 * exposicao_dia (cumulativa, reenviada inteira a cada 3 s), o EA marca o lote como enviado no 2xx e não reenvia:
 * recusar o item inteiro por causa de um balde perderia até 720 baldes. Por isso balde malformado é descartado
 * sozinho (um aviso por item) e os demais seguem para o banco, que faz upsert do que chega.
 */
export const saldoDiaSchema = z
  .object({
    magic: z.number().int().nonnegative(),
    dia: diaIso,
    // true quando o EA mediu o balde já aplicando a regra pública do magic (GET /api/ingest/ping). Ausente ou
    // malformado vira undefined e o banco grava false (só true é publicado); nunca derruba o item.
    regras_aplicadas: tolerante("regras_aplicadas", z.boolean()),
    baldes: z.array(z.unknown()).max(MAX_BALDES_SALDO_DIA),
  })
  .transform((item) => {
    const baldes: BaldeSaldo[] = [];
    let descartados = 0;
    for (const b of item.baldes) {
      const r = baldeSaldoSchema.safeParse(b);
      if (r.success) baldes.push(r.data);
      else descartados++;
    }
    if (descartados > 0) {
      console.warn(
        `[ingest] saldo_dia: ${descartados} balde(s) malformado(s) ignorado(s) no magic ${item.magic} (${item.dia})`,
      );
    }
    return { ...item, baldes };
  });

export const corpoHeartbeatSchema = z.object({
  ea_versao: z.string().max(32).optional(),
  em: dataIso.optional(),
  balance: z.number().optional(),
  equity: z.number().optional(),
  posicoes: z.array(posicaoSchema).max(200).default([]),
  cotacoes: z.array(cotacaoSchema).max(50).default([]),
  // EA 1.1.0. Ausente (EA 1.0.0) é [] em silêncio; lista malformada não derruba o heartbeat (posições e
  // cotações valem mais): vira [] com aviso no log, e o próximo heartbeat, 3 s depois, tenta de novo.
  exposicao_dia: z
    .array(exposicaoDiaSchema)
    .max(50)
    .default([])
    .catch((ctx) => {
      const i = ctx.issues[0];
      const onde = i?.path?.length ? ` em ${i.path.join(".")}` : "";
      console.warn(`[ingest] exposicao_dia ignorada${onde}: ${i?.message ?? "valor inválido"}`);
      return [];
    }),
  // EA 1.1.2: série do saldo do dia por magic (baldes de InpSaldoBucketSeg fechados e ainda não confirmados).
  // Ausente (EA <= 1.1.1) é [] em silêncio. Nunca vira 400: o que não é lista vira [] com aviso; item malformado é
  // ignorado sozinho, com aviso, e os outros magics seguem (o EA marca o lote como enviado no 2xx, então cada item
  // que dá para salvar deve ser salvo; o que este schema descarta está PERDIDO, não "preso na fila"). Mais de
  // MAX_ITENS_SALDO_DIA itens: seguem os primeiros, com aviso, em vez de zerar a lista inteira. Dentro do item, balde
  // malformado é descartado sozinho (saldoDiaSchema).
  saldo_dia: z
    .array(z.unknown())
    .default([])
    .catch((ctx) => {
      console.warn(`[ingest] saldo_dia ignorado: ${ctx.issues[0]?.message ?? "valor inválido"}`);
      return [];
    })
    .transform((itens) => {
      let lista = itens;
      if (lista.length > MAX_ITENS_SALDO_DIA) {
        console.warn(
          `[ingest] saldo_dia: ${lista.length} itens, só os ${MAX_ITENS_SALDO_DIA} primeiros seguem (o EA nunca passa disso)`,
        );
        lista = lista.slice(0, MAX_ITENS_SALDO_DIA);
      }
      return lista.flatMap((x, indice) => {
        const r = saldoDiaSchema.safeParse(x);
        if (r.success) return [r.data];
        const i = r.error.issues[0];
        const onde = i?.path?.length ? ` em ${i.path.join(".")}` : "";
        console.warn(`[ingest] saldo_dia: item ${indice} ignorado${onde}: ${i?.message ?? "valor inválido"}`);
        return [];
      });
    }),
});

export const corpoHistorySchema = z.object({
  ea_versao: z.string().max(32).optional(),
  de: dataIso.optional(),
  ate: dataIso.optional(),
  pagina: z.number().int().positive().optional(),
  total_paginas: z.number().int().positive().optional(),
  deals: z.array(dealSchema).max(500),
});

/** Barra M1 fechada do índice, como o EA lê de CopyRates. Preços em pontos, volumes crus. */
export const candleSchema = z
  .object({
    t: dataIso,
    o: z.number().nonnegative(),
    h: z.number().nonnegative(),
    l: z.number().nonnegative(),
    c: z.number().nonnegative(),
    v: z.number().int().nonnegative().default(0),
    vr: z.number().nonnegative().nullish(),
  })
  .refine((k) => k.l <= Math.min(k.o, k.c) && Math.max(k.o, k.c) <= k.h, {
    message: "mínima deve ser <= min(abertura, fechamento) e máxima >= max(abertura, fechamento)",
  })
  // toda barra do MT5 abre num minuto cheio; um "13:40:01Z" (offset de servidor arredondado errado) entraria
  // como outra chave em candles e a mesma barra ficaria duas vezes, uma em cada segundo
  .refine(
    (k) => {
      const d = new Date(k.t);
      return d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
    },
    { message: "abertura da barra deve ser um minuto cheio (segundos e milissegundos zero)" },
  );

/** Timeframes do MT5 (ENUM_TIMEFRAMES): M1..M30, H1..H12, D1, W1, MN1. Hoje o EA manda só M1. */
const timeframe = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^(M\d{1,2}|H\d{1,2}|D1|W1|MN1)$/, "timeframe desconhecido");

/**
 * POST /api/ingest/candles. Aqui a validação é estrita de propósito: o EA não tem fila para candles
 * (400 só loga e a barra é relida no próximo envio), então corpo inválido vira 400 e nada é gravado.
 */
export const corpoCandlesSchema = z.object({
  ea_versao: z.string().max(32).optional(),
  simbolo,
  timeframe: timeframe.default("M1"),
  candles: z.array(candleSchema).max(200),
});

export type Deal = z.output<typeof dealSchema>;
export type CorpoDeal = z.output<typeof corpoDealSchema>;
export type CorpoHeartbeat = z.output<typeof corpoHeartbeatSchema>;
export type CorpoHistory = z.output<typeof corpoHistorySchema>;
export type Posicao = z.output<typeof posicaoSchema>;
export type ExposicaoDia = z.output<typeof exposicaoDiaSchema>;
export type BaldeSaldo = z.output<typeof baldeSaldoSchema>;
export type SaldoDia = z.output<typeof saldoDiaSchema>;
export type Candle = z.output<typeof candleSchema>;
export type CorpoCandles = z.output<typeof corpoCandlesSchema>;
