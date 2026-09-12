-- =============================================================================
-- 0013 · Robôs só com histórico importado (sem conta/coletor no MT5)
--   - operacoes.conta_id opcional (operação manual pode não ter conta)
--   - robos_publico.tem_coletor: o site mostra "histórico" em vez de
--     "sem atualização" quando não há conta principal
-- =============================================================================

alter table public.operacoes alter column conta_id drop not null;

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
      where o.robo_id = r.id
        and public.operacao_e_publica(o.origem, o.dia_pregao, o.conta_id, r.conta_principal_id, r.historico_manual_ate))
  )                     as conta_real_desde,
  cs.ultimo_heartbeat   as ultimo_heartbeat_em,
  (select max(o.fechamento_em) from public.operacoes o
    where o.robo_id = r.id
      and public.operacao_e_publica(o.origem, o.dia_pregao, o.conta_id, r.conta_principal_id, r.historico_manual_ate)) as ultima_operacao_em,
  exists (
    select 1 from public.posicoes_abertas pa
     where pa.robo_id = r.id
       and pa.conta_id = r.conta_principal_id
       and now() >= pa.aberta_em + make_interval(secs => r.atraso_publico_segundos)
  )                     as posicionado,
  r.relatorio_mt5_url,
  cm.tipo               as conta_tipo,
  (r.conta_principal_id is not null) as tem_coletor
from public.robos r
join public.multiplicadores m on m.prefixo_simbolo = r.ativo
left join public.coleta_status cs on cs.conta_id = r.conta_principal_id
left join public.contas_matriz cm on cm.id = r.conta_principal_id;

grant select on public.robos_publico to anon, authenticated;
