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
});

export const cotacaoSchema = z.object({
  simbolo,
  preco: z.number().positive(),
  fechamento_anterior: z.number().nonnegative().nullish(),
});

export const corpoHeartbeatSchema = z.object({
  ea_versao: z.string().max(32).optional(),
  em: dataIso.optional(),
  balance: z.number().optional(),
  equity: z.number().optional(),
  posicoes: z.array(posicaoSchema).max(200).default([]),
  cotacoes: z.array(cotacaoSchema).max(50).default([]),
});

export const corpoHistorySchema = z.object({
  ea_versao: z.string().max(32).optional(),
  de: dataIso.optional(),
  ate: dataIso.optional(),
  pagina: z.number().int().positive().optional(),
  total_paginas: z.number().int().positive().optional(),
  deals: z.array(dealSchema).max(500),
});

export type Deal = z.output<typeof dealSchema>;
export type CorpoDeal = z.output<typeof corpoDealSchema>;
export type CorpoHeartbeat = z.output<typeof corpoHeartbeatSchema>;
export type CorpoHistory = z.output<typeof corpoHistorySchema>;
