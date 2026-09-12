-- =============================================================================
-- 0004 · Operações (deals pareados) e estatísticas diárias
-- =============================================================================

-- Uma operação = um ciclo de posição fechado (entrada até zerar).
-- Em conta netting o mesmo posicao_id pode ter mais de um ciclo (reversão),
-- por isso a chave natural é (conta, posicao, ciclo).
create table public.operacoes (
  id                           bigint generated always as identity primary key,
  robo_id                      uuid references public.robos (id) on delete set null,
  conta_id                     uuid not null references public.contas_matriz (id) on delete cascade,
  posicao_id                   bigint,
  ciclo                        smallint not null default 1,
  simbolo                      text not null,
  prefixo_simbolo              text not null references public.multiplicadores (prefixo_simbolo),
  lado                         public.lado_operacao not null,
  contratos                    numeric(12, 2) not null check (contratos > 0),
  preco_entrada                numeric(14, 3) not null,
  preco_saida                  numeric(14, 3) not null,
  abertura_em                  timestamptz not null,
  fechamento_em                timestamptz not null,
  duracao_seg                  integer not null default 0,
  pontos                       numeric(14, 3) not null,
  pontos_por_contrato          numeric(14, 3) not null,
  resultado_brl                numeric(14, 2) not null,   -- bruto, como o MT5 reporta
  resultado_brl_por_contrato   numeric(14, 4) not null,
  custos_brl                   numeric(14, 2) not null default 0,
  custos_brl_por_contrato      numeric(14, 4) not null default 0,
  versao_robo                  text,
  origem                       public.origem_operacao not null default 'mt5',
  dia_pregao                   date not null,
  criado_em                    timestamptz not null default now(),
  atualizado_em                timestamptz not null default now()
);
comment on column public.operacoes.resultado_brl is 'Bruto (lucro do MT5). Líquido = resultado_brl - custos_brl.';
-- Índice total (não parcial) pra o upsert do PostgREST conseguir usar.
-- Operações manuais têm posicao_id nulo, então nunca colidem.
create unique index operacoes_conta_posicao_ciclo_uidx
  on public.operacoes (conta_id, posicao_id, ciclo);
create index operacoes_robo_dia_idx on public.operacoes (robo_id, dia_pregao);
create index operacoes_robo_fechamento_idx on public.operacoes (robo_id, fechamento_em desc);

-- Preenche derivados se o app não mandar
create or replace function public.operacoes_preencher_derivados()
returns trigger
language plpgsql
as $$
begin
  if new.dia_pregao is null then
    new.dia_pregao := public.dia_pregao_de(new.fechamento_em);
  end if;
  if new.duracao_seg is null or new.duracao_seg = 0 then
    new.duracao_seg := greatest(0, extract(epoch from (new.fechamento_em - new.abertura_em))::integer);
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
create trigger operacoes_derivados
  before insert or update on public.operacoes
  for each row execute function public.operacoes_preencher_derivados();

-- -----------------------------------------------------------------------------
-- Estatísticas diárias por robô, sempre normalizadas por 1 contrato e
-- calculadas só sobre a conta principal do robô.
-- Gain/loss classificados pelo resultado LÍQUIDO (bruto - custos).
-- -----------------------------------------------------------------------------
create table public.estatisticas_diarias (
  robo_id                       uuid not null references public.robos (id) on delete cascade,
  dia                           date not null,
  pontos_por_contrato           numeric(14, 3) not null default 0,
  resultado_brl_por_contrato    numeric(14, 4) not null default 0,   -- bruto
  custos_brl_por_contrato       numeric(14, 4) not null default 0,
  n_operacoes                   integer not null default 0,
  n_gain                        integer not null default 0,
  n_loss                        integer not null default 0,
  soma_gain_brl_por_contrato    numeric(14, 4) not null default 0,
  soma_loss_brl_por_contrato    numeric(14, 4) not null default 0,   -- valor negativo
  maior_gain_brl_por_contrato   numeric(14, 4) not null default 0,
  maior_loss_brl_por_contrato   numeric(14, 4) not null default 0,   -- valor negativo
  atualizado_em                 timestamptz not null default now(),
  primary key (robo_id, dia)
);

-- Cache de payloads pesados (fase 2: embed, OG, períodos)
create table public.estatisticas_cache (
  robo_id       uuid not null references public.robos (id) on delete cascade,
  periodo       text not null,
  payload       jsonb not null,
  calculado_em  timestamptz not null default now(),
  primary key (robo_id, periodo)
);

-- Recalcula a linha (robô, dia) a partir das operações da conta principal
create or replace function public.recalcular_estatisticas_dia(p_robo_id uuid, p_dia date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conta uuid;
begin
  if p_robo_id is null or p_dia is null then
    return;
  end if;

  select conta_principal_id into v_conta from public.robos where id = p_robo_id;

  insert into public.estatisticas_diarias as e (
    robo_id, dia,
    pontos_por_contrato, resultado_brl_por_contrato, custos_brl_por_contrato,
    n_operacoes, n_gain, n_loss,
    soma_gain_brl_por_contrato, soma_loss_brl_por_contrato,
    maior_gain_brl_por_contrato, maior_loss_brl_por_contrato,
    atualizado_em
  )
  select
    p_robo_id, p_dia,
    coalesce(sum(o.pontos_por_contrato), 0),
    coalesce(sum(o.resultado_brl_por_contrato), 0),
    coalesce(sum(o.custos_brl_por_contrato), 0),
    count(*),
    count(*) filter (where o.liquido > 0),
    count(*) filter (where o.liquido < 0),
    coalesce(sum(o.liquido) filter (where o.liquido > 0), 0),
    coalesce(sum(o.liquido) filter (where o.liquido < 0), 0),
    coalesce(max(o.liquido) filter (where o.liquido > 0), 0),
    coalesce(min(o.liquido) filter (where o.liquido < 0), 0),
    now()
  from (
    select op.*, (op.resultado_brl_por_contrato - op.custos_brl_por_contrato) as liquido
      from public.operacoes op
     where op.robo_id = p_robo_id
       and op.dia_pregao = p_dia
       and v_conta is not null
       and op.conta_id = v_conta
  ) o
  on conflict (robo_id, dia) do update set
    pontos_por_contrato          = excluded.pontos_por_contrato,
    resultado_brl_por_contrato   = excluded.resultado_brl_por_contrato,
    custos_brl_por_contrato      = excluded.custos_brl_por_contrato,
    n_operacoes                  = excluded.n_operacoes,
    n_gain                       = excluded.n_gain,
    n_loss                       = excluded.n_loss,
    soma_gain_brl_por_contrato   = excluded.soma_gain_brl_por_contrato,
    soma_loss_brl_por_contrato   = excluded.soma_loss_brl_por_contrato,
    maior_gain_brl_por_contrato  = excluded.maior_gain_brl_por_contrato,
    maior_loss_brl_por_contrato  = excluded.maior_loss_brl_por_contrato,
    atualizado_em                = now();

  -- Dia sem operação não fica na série
  delete from public.estatisticas_diarias
   where robo_id = p_robo_id and dia = p_dia and n_operacoes = 0;
end;
$$;

-- Recalcula todos os dias de um robô (usado ao trocar a conta principal)
create or replace function public.recalcular_estatisticas_robo(p_robo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  delete from public.estatisticas_diarias where robo_id = p_robo_id;
  for r in
    select distinct o.dia_pregao
      from public.operacoes o
      join public.robos rb on rb.id = o.robo_id and rb.conta_principal_id = o.conta_id
     where o.robo_id = p_robo_id
  loop
    perform public.recalcular_estatisticas_dia(p_robo_id, r.dia_pregao);
  end loop;
end;
$$;

-- Trigger: qualquer mudança em operações recalcula o(s) dia(s) afetado(s)
create or replace function public.operacoes_recalcular_estatisticas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalcular_estatisticas_dia(old.robo_id, old.dia_pregao);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if tg_op = 'INSERT'
       or new.robo_id is distinct from old.robo_id
       or new.dia_pregao is distinct from old.dia_pregao
       or new.resultado_brl_por_contrato is distinct from old.resultado_brl_por_contrato
       or new.custos_brl_por_contrato is distinct from old.custos_brl_por_contrato
       or new.pontos_por_contrato is distinct from old.pontos_por_contrato
       or new.conta_id is distinct from old.conta_id
    then
      perform public.recalcular_estatisticas_dia(new.robo_id, new.dia_pregao);
    end if;
  end if;
  return null;
end;
$$;
create trigger operacoes_estatisticas
  after insert or update or delete on public.operacoes
  for each row execute function public.operacoes_recalcular_estatisticas();

-- Trigger: trocar a conta principal do robô refaz a série inteira
create or replace function public.robos_conta_principal_mudou()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.conta_principal_id is distinct from old.conta_principal_id then
    perform public.recalcular_estatisticas_robo(new.id);
  end if;
  return null;
end;
$$;
create trigger robos_conta_principal
  after update of conta_principal_id on public.robos
  for each row execute function public.robos_conta_principal_mudou();
