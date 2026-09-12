-- =============================================================================
-- 0003 · Coleta do MT5: deals, posições abertas, snapshots, status,
--        rejeições e cotações
-- =============================================================================

-- Deals crus do MT5. Chave composta: tickets podem colidir entre corretoras.
create table public.deals (
  conta_id      uuid not null references public.contas_matriz (id) on delete cascade,
  ticket        bigint not null,
  robo_id       uuid references public.robos (id) on delete set null,
  posicao_id    bigint not null default 0,
  ordem         bigint,
  simbolo       text not null,
  tipo          text not null,   -- buy | sell | balance | credit | ... (ENUM_DEAL_TYPE em texto)
  entry         text not null,   -- in | out | inout | out_by (ENUM_DEAL_ENTRY em texto)
  volume        numeric(12, 2) not null default 0,
  preco         numeric(14, 3) not null default 0,
  lucro         numeric(14, 2) not null default 0,
  comissao      numeric(14, 2) not null default 0,
  swap          numeric(14, 2) not null default 0,
  executado_em  timestamptz not null,
  magic         bigint not null default 0,
  comentario    text,
  raw           jsonb,
  recebido_em   timestamptz not null default now(),
  primary key (conta_id, ticket)
);
comment on column public.deals.robo_id is 'Nulo = magic não mapeado ("não atribuído"), visível só no admin.';
create index deals_conta_posicao_idx on public.deals (conta_id, posicao_id);
create index deals_robo_executado_idx on public.deals (robo_id, executado_em desc);

-- Posições abertas agora, por conta. Sincronizada a cada heartbeat e a cada deal.
create table public.posicoes_abertas (
  conta_id          uuid not null references public.contas_matriz (id) on delete cascade,
  ticket            bigint not null,
  robo_id           uuid references public.robos (id) on delete set null,
  magic             bigint not null default 0,
  simbolo           text not null,
  lado              public.lado_operacao not null,
  volume            numeric(12, 2) not null,
  preco_abertura    numeric(14, 3) not null,
  lucro_flutuante   numeric(14, 2) not null default 0,
  aberta_em         timestamptz not null,
  atualizado_em     timestamptz not null default now(),
  primary key (conta_id, ticket)
);
create index posicoes_abertas_robo_idx on public.posicoes_abertas (robo_id);

-- Balance/equity por minuto (não por heartbeat)
create table public.snapshots_conta (
  id        bigint generated always as identity primary key,
  conta_id  uuid not null references public.contas_matriz (id) on delete cascade,
  balance   numeric(14, 2) not null,
  equity    numeric(14, 2) not null,
  em        timestamptz not null,
  minuto    timestamptz not null,
  unique (conta_id, minuto)
);

-- Saúde do coletor por conta
create table public.coleta_status (
  conta_id          uuid primary key references public.contas_matriz (id) on delete cascade,
  ultimo_heartbeat  timestamptz,
  ultimo_deal       timestamptz,
  versao_ea         text,
  balance           numeric(14, 2),
  equity            numeric(14, 2),
  n_posicoes        integer not null default 0,
  atualizado_em     timestamptz not null default now()
);

-- Log de rejeições do ingest (token inválido, payload inválido, rate limit)
create table public.coleta_rejeicoes (
  id           bigint generated always as identity primary key,
  conta_id     uuid references public.contas_matriz (id) on delete set null,
  endpoint     text not null,
  status_http  integer not null,
  motivo       text not null,
  ip           text,
  payload      jsonb,
  em           timestamptz not null default now()
);
create index coleta_rejeicoes_em_idx on public.coleta_rejeicoes (em desc);

-- Último preço por símbolo (alimenta "WIN e WDO agora" na barra da home)
create table public.cotacoes (
  simbolo               text primary key,
  prefixo_simbolo       text not null references public.multiplicadores (prefixo_simbolo),
  preco                 numeric(14, 3) not null,
  fechamento_anterior   numeric(14, 3),
  em                    timestamptz not null default now()
);

-- Controle de throttle dos broadcasts realtime (chave -> última transmissão)
create table public.broadcast_controle (
  chave      text primary key,
  ultimo_em  timestamptz not null
);
