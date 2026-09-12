-- =============================================================================
-- 0011 · Fase 2
--   - contas_matriz.tipo (real | demo): o site mostra selo "conta demo"
--   - robos.relatorio_mt5_url: link do relatório mensal do MT5
--   - robos_publico ganha as duas colunas (no fim, pra CREATE OR REPLACE)
-- =============================================================================

alter table public.contas_matriz
  add column if not exists tipo text not null default 'real'
  check (tipo in ('real', 'demo'));
comment on column public.contas_matriz.tipo is 'real ou demo. Aparece como selo público quando é a conta principal de um robô.';

alter table public.robos
  add column if not exists relatorio_mt5_url text;
comment on column public.robos.relatorio_mt5_url is 'Link público do relatório mensal exportado do MT5 (Drive, Storage...).';

create or replace view public.robos_publico
with (security_invoker = false)
as
select
  r.id,
  r.slug,
  r.nome,
  r.ativo,
  m.nome                as ativo_nome,
  m.valor_ponto_brl,
  r.descricao_publica,
  r.horario_inicio,
  r.horario_fim,
  r.contratos_padrao,
  r.custo_por_contrato,
  r.capital_referencia,
  r.status,
  r.versao_atual,
  r.ordem,
  coalesce(
    r.conta_real_desde,
    (select min(o.dia_pregao) from public.operacoes o
      where o.robo_id = r.id and o.conta_id = r.conta_principal_id)
  )                     as conta_real_desde,
  cs.ultimo_heartbeat   as ultimo_heartbeat_em,
  (select max(o.fechamento_em) from public.operacoes o
    where o.robo_id = r.id and o.conta_id = r.conta_principal_id) as ultima_operacao_em,
  exists (
    select 1 from public.posicoes_abertas pa
     where pa.robo_id = r.id
       and pa.conta_id = r.conta_principal_id
       and now() >= pa.aberta_em + make_interval(secs => r.atraso_publico_segundos)
  )                     as posicionado,
  r.relatorio_mt5_url,
  cm.tipo               as conta_tipo
from public.robos r
join public.multiplicadores m on m.prefixo_simbolo = r.ativo
left join public.coleta_status cs on cs.conta_id = r.conta_principal_id
left join public.contas_matriz cm on cm.id = r.conta_principal_id;

grant select on public.robos_publico to anon, authenticated;

-- operacoes_publico ganha o líquido por contrato no fim (filtro gain/loss na
-- página de operações precisa de uma coluna, o PostgREST não compara colunas)
create or replace view public.operacoes_publico
with (security_invoker = false)
as
select
  o.id,
  o.robo_id,
  r.slug,
  o.simbolo,
  o.prefixo_simbolo,
  o.lado,
  o.abertura_em,
  o.fechamento_em,
  o.duracao_seg,
  o.preco_entrada,
  o.preco_saida,
  o.pontos_por_contrato,
  o.resultado_brl_por_contrato,
  o.custos_brl_por_contrato,
  o.versao_robo,
  o.dia_pregao,
  (o.resultado_brl_por_contrato - o.custos_brl_por_contrato) as resultado_liquido_por_contrato
from public.operacoes o
join public.robos r on r.id = o.robo_id and r.conta_principal_id = o.conta_id;

grant select on public.operacoes_publico to anon, authenticated;
