-- =============================================================================
-- 0014 · Fonte por dia: importação manual substitui o MT5 no dia inteiro
--   Regra antiga: um corte único por robô (historico_manual_ate).
--   Regra nova: para cada (robô, dia), se existe operação manual, só ela conta;
--   se não existe, vale o MT5 da conta principal. historico_manual_ate deixa
--   de ter efeito e fica só como informação.
-- =============================================================================

create index if not exists operacoes_manual_robo_dia_idx
  on public.operacoes (robo_id, dia_pregao) where origem = 'manual';

create or replace function public.dia_tem_importacao(p_robo_id uuid, p_dia date)
returns boolean
language sql
stable
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
as $$
  select case
    when p_origem = 'manual' then true
    else (p_conta_id is not null
          and p_conta_id = p_conta_principal_id
          and not public.dia_tem_importacao(p_robo_id, p_dia))
  end;
$$;

create or replace view public.operacoes_publico
with (security_invoker = false)
as
select
  o.id, o.robo_id, r.slug, o.simbolo, o.prefixo_simbolo, o.lado,
  o.abertura_em, o.fechamento_em, o.duracao_seg, o.preco_entrada, o.preco_saida,
  o.pontos_por_contrato, o.resultado_brl_por_contrato, o.custos_brl_por_contrato,
  o.versao_robo, o.dia_pregao,
  (o.resultado_brl_por_contrato - o.custos_brl_por_contrato) as resultado_liquido_por_contrato,
  o.origem
from public.operacoes o
join public.robos r on r.id = o.robo_id
where public.operacao_e_publica(o.origem, o.dia_pregao, o.conta_id, r.conta_principal_id, r.id);

grant select on public.operacoes_publico to anon, authenticated;

create or replace view public.robos_publico
with (security_invoker = false)
as
select
  r.id, r.slug, r.nome, r.ativo, m.nome as ativo_nome, m.valor_ponto_brl,
  r.descricao_publica, r.horario_inicio, r.horario_fim, r.contratos_padrao,
  r.custo_por_contrato, r.capital_referencia, r.status, r.versao_atual, r.ordem,
  coalesce(
    r.conta_real_desde,
    (select min(o.dia_pregao) from public.operacoes o
      where o.robo_id = r.id
        and public.operacao_e_publica(o.origem, o.dia_pregao, o.conta_id, r.conta_principal_id, r.id))
  ) as conta_real_desde,
  cs.ultimo_heartbeat as ultimo_heartbeat_em,
  (select max(o.fechamento_em) from public.operacoes o
    where o.robo_id = r.id
      and public.operacao_e_publica(o.origem, o.dia_pregao, o.conta_id, r.conta_principal_id, r.id)) as ultima_operacao_em,
  exists (
    select 1 from public.posicoes_abertas pa
     where pa.robo_id = r.id
       and pa.conta_id = r.conta_principal_id
       and now() >= pa.aberta_em + make_interval(secs => r.atraso_publico_segundos)
  ) as posicionado,
  r.relatorio_mt5_url,
  cm.tipo as conta_tipo,
  (r.conta_principal_id is not null) as tem_coletor
from public.robos r
join public.multiplicadores m on m.prefixo_simbolo = r.ativo
left join public.coleta_status cs on cs.conta_id = r.conta_principal_id
left join public.contas_matriz cm on cm.id = r.conta_principal_id;

grant select on public.robos_publico to anon, authenticated;

-- Estatísticas diárias seguem a regra por dia
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
       and public.operacao_e_publica(op.origem, op.dia_pregao, op.conta_id, v_conta, p_robo_id)
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

  delete from public.estatisticas_diarias
   where robo_id = p_robo_id and dia = p_dia and n_operacoes = 0;
end;
$$;

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
      join public.robos rb on rb.id = o.robo_id
     where o.robo_id = p_robo_id
       and public.operacao_e_publica(o.origem, o.dia_pregao, o.conta_id, rb.conta_principal_id, rb.id)
  loop
    perform public.recalcular_estatisticas_dia(p_robo_id, r.dia_pregao);
  end loop;
end;
$$;

-- A versão antiga (com data de corte) sai para não restar ambiguidade
drop function if exists public.operacao_e_publica(public.origem_operacao, date, uuid, uuid, date);

comment on column public.robos.historico_manual_ate is
  'Sem efeito desde a 0014: a fonte é decidida por dia (importação manual substitui o MT5 no dia). Mantido só como informação.';
