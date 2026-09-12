-- =============================================================================
-- 0002 · Cadastro: multiplicadores, robôs, contas da matriz, magics,
--        feriados e parâmetros
-- =============================================================================

-- Valor do ponto por prefixo de símbolo (WIN, WDO). O símbolo real muda de
-- série a cada vencimento (WINV26, WINZ26...), então tudo mapeia pelo prefixo.
create table public.multiplicadores (
  prefixo_simbolo    text primary key,
  nome               text not null,
  valor_ponto_brl    numeric(12, 4) not null check (valor_ponto_brl > 0),
  margem_referencia  numeric(14, 2),
  pregao_inicio      time not null default '09:00',
  pregao_fim         time not null default '18:00',
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create trigger multiplicadores_atualizado_em
  before update on public.multiplicadores
  for each row execute function public.set_atualizado_em();

-- Contas da matriz. numero_conta NUNCA sai desta tabela.
create table public.contas_matriz (
  id             uuid primary key default gen_random_uuid(),
  apelido        text not null,
  corretora      text not null,
  numero_conta   text not null,
  token_hash     text unique,
  ativa          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
comment on column public.contas_matriz.numero_conta is
  'Privado. Nunca expor em view pública, API pública, broadcast ou frontend.';
comment on column public.contas_matriz.token_hash is
  'sha256 (hex) do token do coletor. O token em claro só aparece uma vez, ao ser gerado.';
create trigger contas_matriz_atualizado_em
  before update on public.contas_matriz
  for each row execute function public.set_atualizado_em();

-- Robôs. Nada de robô hardcoded no código: tudo vem daqui.
create table public.robos (
  id                        uuid primary key default gen_random_uuid(),
  slug                      text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome                      text not null,
  ativo                     text not null references public.multiplicadores (prefixo_simbolo),
  descricao_publica         text,
  horario_inicio            time,
  horario_fim               time,
  contratos_padrao          integer not null default 1 check (contratos_padrao > 0),
  custo_por_contrato        numeric(10, 2) not null default 0 check (custo_por_contrato >= 0),
  capital_referencia        numeric(14, 2) check (capital_referencia is null or capital_referencia > 0),
  atraso_publico_segundos   integer not null default 0 check (atraso_publico_segundos >= 0),
  status                    public.robo_status not null default 'em_breve',
  versao_atual              text,
  ordem                     integer not null default 100,
  conta_real_desde          date,
  -- Conta cuja execução alimenta as estatísticas públicas deste robô.
  -- Definida automaticamente no primeiro mapeamento de magic (ver trigger abaixo).
  conta_principal_id        uuid references public.contas_matriz (id) on delete set null,
  criado_em                 timestamptz not null default now(),
  atualizado_em             timestamptz not null default now()
);
comment on column public.robos.conta_principal_id is
  'Conta da matriz que alimenta as views públicas. Outras contas do mesmo robô ficam só no admin.';
create index robos_status_ordem_idx on public.robos (status, ordem);
create trigger robos_atualizado_em
  before update on public.robos
  for each row execute function public.set_atualizado_em();

-- Mapeamento (conta, magic) -> robô. A identificação de um robô é sempre esse par.
create table public.robo_conta_magic (
  conta_id     uuid not null references public.contas_matriz (id) on delete cascade,
  magic        bigint not null,
  robo_id      uuid not null references public.robos (id) on delete cascade,
  versao_robo  text,
  criado_em    timestamptz not null default now(),
  primary key (conta_id, magic)
);
create index robo_conta_magic_robo_idx on public.robo_conta_magic (robo_id);

-- Primeiro mapeamento de um robô define a conta principal, se ainda não houver.
create or replace function public.definir_conta_principal_padrao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.robos
     set conta_principal_id = new.conta_id
   where id = new.robo_id
     and conta_principal_id is null;
  return new;
end;
$$;
create trigger robo_conta_magic_conta_principal
  after insert on public.robo_conta_magic
  for each row execute function public.definir_conta_principal_padrao();

-- Feriados da B3 (sábado e domingo já não contam)
create table public.feriados_b3 (
  dia        date primary key,
  descricao  text not null
);

-- Parâmetros gerais editáveis sem deploy (fator de segurança, links, textos)
create table public.parametros (
  chave          text primary key,
  valor          jsonb not null,
  descricao      text,
  publico        boolean not null default false,
  atualizado_em  timestamptz not null default now()
);
create trigger parametros_atualizado_em
  before update on public.parametros
  for each row execute function public.set_atualizado_em();
