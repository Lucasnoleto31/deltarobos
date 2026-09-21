-- =============================================================================
-- 0018 · Duração mínima por robô: operação com duracao_seg menor que
--   robos.duracao_minima_seg não conta no site nem nas estatísticas, a partir
--   do pregão robos.duracao_minima_desde (nulo = histórico inteiro).
--   Motivo (21/09/2026): na conta demo o MT5 preenche a ordem a mercado num
--   preço defasado e o take-profit bate milissegundos depois. Sobram centenas de
--   "operações" de 0 s, todas ganhando exatamente o alvo (150 pontos), que uma
--   corretora real nunca daria. Regra, não exclusão: nada é apagado, a
--   ressincronização do MT5 não recria nada e voltar atrás é um update.
--   Mesmo desenho da hora mínima (0016/0017).
-- =============================================================================

alter table public.robos add column if not exists duracao_minima_seg integer;
alter table public.robos add column if not exists duracao_minima_desde date;
comment on column public.robos.duracao_minima_seg is
  'Operações com duracao_seg menor que isto ficam fora do site e das estatísticas. Nulo = sem corte.';
comment on column public.robos.duracao_minima_desde is
  'Primeiro dia de pregão em que a duração mínima vale. Nulo = histórico inteiro.';

-- Nova assinatura: recebe também a duração. A de 6 argumentos sai no fim.
create or replace function public.operacao_e_publica(
  p_origem public.origem_operacao,
  p_dia date,
  p_conta_id uuid,
  p_conta_principal_id uuid,
  p_robo_id uuid,
  p_abertura_em timestamptz,
  p_duracao_seg integer
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (case
       when p_origem = 'manual' then true
       else (p_conta_id is not null
             and p_conta_id = p_conta_principal_id
             and not public.dia_tem_importacao(p_robo_id, p_dia))
     end)
    and not exists (
      select 1 from public.robos r
       where r.id = p_robo_id
         and (
           (r.hora_minima_operacao is not null
            and p_abertura_em is not null
            and (p_abertura_em at time zone 'America/Sao_Paulo')::time < r.hora_minima_operacao)
           or
           (r.duracao_minima_seg is not null
            and coalesce(p_duracao_seg, 0) < r.duracao_minima_seg
            and (r.duracao_minima_desde is null or p_dia >= r.duracao_minima_desde))
         )
    );
$$;
revoke all on function public.operacao_e_publica(public.origem_operacao, date, uuid, uuid, uuid, timestamptz, integer) from public;
grant execute on function public.operacao_e_publica(public.origem_operacao, date, uuid, uuid, uuid, timestamptz, integer) to anon, authenticated, service_role;

-- A view pública mantém o filtro em SQL puro (0017), agora com a duração
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
where (
        o.origem = 'manual'
        or (o.conta_id is not null
            and o.conta_id = r.conta_principal_id
            and not exists (
              select 1 from public.operacoes m
               where m.robo_id = o.robo_id and m.dia_pregao = o.dia_pregao and m.origem = 'manual'))
      )
  and (r.hora_minima_operacao is null
       or (o.abertura_em at time zone 'America/Sao_Paulo')::time >= r.hora_minima_operacao)
  and (r.duracao_minima_seg is null
       or o.duracao_seg >= r.duracao_minima_seg
       or (r.duracao_minima_desde is not null and o.dia_pregao < r.duracao_minima_desde));

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
    (select min(op.dia_pregao) from public.operacoes_publico op where op.robo_id = r.id)
  ) as conta_real_desde,
  cs.ultimo_heartbeat as ultimo_heartbeat_em,
  (select max(op.fechamento_em) from public.operacoes_publico op where op.robo_id = r.id) as ultima_operacao_em,
  exists (
    select 1 from public.posicoes_abertas pa
     where pa.robo_id = r.id
       and pa.conta_id = r.conta_principal_id
       and now() >= pa.aberta_em + make_interval(secs => r.atraso_publico_segundos)
  ) as posicionado,
  r.relatorio_mt5_url,
  cm.tipo as conta_tipo,
  (r.conta_principal_id is not null) as tem_coletor,
  r.hora_minima_operacao,
  r.duracao_minima_seg,
  r.duracao_minima_desde
from public.robos r
join public.multiplicadores m on m.prefixo_simbolo = r.ativo
left join public.coleta_status cs on cs.conta_id = r.conta_principal_id
left join public.contas_matriz cm on cm.id = r.conta_principal_id;

grant select on public.robos_publico to anon, authenticated;

-- Estatísticas diárias seguem a regra
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
       and public.operacao_e_publica(op.origem, op.dia_pregao, op.conta_id, v_conta, p_robo_id, op.abertura_em, op.duracao_seg)
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
       and public.operacao_e_publica(o.origem, o.dia_pregao, o.conta_id, rb.conta_principal_id, rb.id, o.abertura_em, o.duracao_seg)
  loop
    perform public.recalcular_estatisticas_dia(p_robo_id, r.dia_pregao);
  end loop;
end;
$$;

-- Mudar a duração mínima (ou o dia em que ela começa) refaz a série inteira
create or replace function public.robos_conta_principal_mudou()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.conta_principal_id is distinct from old.conta_principal_id
     or new.historico_manual_ate is distinct from old.historico_manual_ate
     or new.hora_minima_operacao is distinct from old.hora_minima_operacao
     or new.duracao_minima_seg is distinct from old.duracao_minima_seg
     or new.duracao_minima_desde is distinct from old.duracao_minima_desde then
    perform public.recalcular_estatisticas_robo(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists robos_conta_principal on public.robos;
create trigger robos_conta_principal
  after update of conta_principal_id, historico_manual_ate, hora_minima_operacao,
                  duracao_minima_seg, duracao_minima_desde on public.robos
  for each row execute function public.robos_conta_principal_mudou();

-- A assinatura antiga (6 argumentos) sai para não restar ambiguidade
drop function if exists public.operacao_e_publica(public.origem_operacao, date, uuid, uuid, uuid, timestamptz);
