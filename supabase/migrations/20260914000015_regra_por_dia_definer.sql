-- =============================================================================
-- 0015 · A regra por dia lê public.operacoes; como as views rodam como dono mas
--   as funções rodam como quem chama (anon), a leitura falhava por permissão e
--   as views públicas quebravam. Funções passam a security definer.
-- =============================================================================

create or replace function public.dia_tem_importacao(p_robo_id uuid, p_dia date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.operacoes m
     where m.robo_id = p_robo_id and m.dia_pregao = p_dia and m.origem = 'manual'
  );
$$;

create or replace function public.operacao_e_publica(
  p_origem public.origem_operacao,
  p_dia date,
  p_conta_id uuid,
  p_conta_principal_id uuid,
  p_robo_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_origem = 'manual' then true
    else (p_conta_id is not null
          and p_conta_id = p_conta_principal_id
          and not public.dia_tem_importacao(p_robo_id, p_dia))
  end;
$$;

revoke all on function public.dia_tem_importacao(uuid, date) from public;
revoke all on function public.operacao_e_publica(public.origem_operacao, date, uuid, uuid, uuid) from public;
grant execute on function public.dia_tem_importacao(uuid, date) to anon, authenticated, service_role;
grant execute on function public.operacao_e_publica(public.origem_operacao, date, uuid, uuid, uuid) to anon, authenticated, service_role;
