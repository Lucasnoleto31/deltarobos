-- =============================================================================
-- 0005 · Usuários, contas de cliente, licenças, comunicados e alertas
--        (schema completo agora; lógica nas fases 3 e 4)
-- =============================================================================

create table public.perfis (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  nome           text,
  telefone       text,
  role           public.role_perfil not null default 'cliente',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create trigger perfis_atualizado_em
  before update on public.perfis
  for each row execute function public.set_atualizado_em();

-- Cria o perfil automaticamente no cadastro
create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (user_id, nome)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'nome',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

create table public.contas_cliente (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  corretora      text not null,
  numero_conta   text not null,
  apelido        text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index contas_cliente_user_idx on public.contas_cliente (user_id);
create trigger contas_cliente_atualizado_em
  before update on public.contas_cliente
  for each row execute function public.set_atualizado_em();

create table public.licencas (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  robo_id            uuid not null references public.robos (id) on delete restrict,
  conta_cliente_id   uuid references public.contas_cliente (id) on delete set null,
  chave              text not null unique,
  status             public.status_licenca not null default 'ativa',
  valida_ate         date,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index licencas_user_idx on public.licencas (user_id);
create trigger licencas_atualizado_em
  before update on public.licencas
  for each row execute function public.set_atualizado_em();

create table public.comunicados (
  id             bigint generated always as identity primary key,
  titulo         text not null,
  corpo          text not null,
  publico        boolean not null default false,
  publicado_em   timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index comunicados_publicado_idx on public.comunicados (publicado_em desc);
create trigger comunicados_atualizado_em
  before update on public.comunicados
  for each row execute function public.set_atualizado_em();

create table public.alertas_inscricoes (
  id          bigint generated always as identity primary key,
  contato     text not null,
  canal       public.canal_alerta not null,
  robo_id     uuid references public.robos (id) on delete cascade,
  tipo        text not null default 'operacoes',
  criado_em   timestamptz not null default now(),
  unique (contato, canal, robo_id, tipo)
);
