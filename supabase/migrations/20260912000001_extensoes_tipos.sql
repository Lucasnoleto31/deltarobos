-- =============================================================================
-- 0001 · Extensões e tipos base
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Status de cadastro do robô (spec §3)
create type public.robo_status as enum ('ativo', 'em_breve', 'pausado', 'arquivado');

-- Lado de uma operação ou posição
create type public.lado_operacao as enum ('compra', 'venda');

-- Como a operação entrou no sistema
create type public.origem_operacao as enum ('mt5', 'manual');

-- Papel do usuário logado
create type public.role_perfil as enum ('cliente', 'admin');

-- Canal de alerta (fase 4)
create type public.canal_alerta as enum ('whatsapp', 'push', 'email');

-- Status de licença (fase 3)
create type public.status_licenca as enum ('ativa', 'suspensa', 'expirada');

-- Trigger genérica: mantém atualizado_em
create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- Converte um timestamptz para a data do pregão em Brasília
create or replace function public.dia_pregao_de(p_em timestamptz)
returns date
language sql
immutable
as $$
  select (p_em at time zone 'America/Sao_Paulo')::date;
$$;
