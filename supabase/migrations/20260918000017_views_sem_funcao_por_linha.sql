-- =============================================================================
-- 0017 · Desempenho das views públicas
--   operacao_e_publica() é security definer com subconsultas, então o planejador
--   não consegue embuti-la: era chamada uma vez por linha (1 s por página de
--   1.000 operações). Nas views o mesmo filtro passa a ficar escrito em SQL,
--   que o planejador transforma em anti-join com hash (≈ 90 ms por página).
--   A função continua existindo para as estatísticas diárias, que trabalham
--   um dia de cada vez. A regra é idêntica:
--     manual: sempre; mt5: conta principal e nenhuma importação no (robô, dia);
--     e, se o robô tem hora_minima_operacao, abertura (Brasília) >= hora mínima.
-- =============================================================================

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
       or (o.abertura_em at time zone 'America/Sao_Paulo')::time >= r.hora_minima_operacao);

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
  r.hora_minima_operacao
from public.robos r
join public.multiplicadores m on m.prefixo_simbolo = r.ativo
left join public.coleta_status cs on cs.conta_id = r.conta_principal_id
left join public.contas_matriz cm on cm.id = r.conta_principal_id;

grant select on public.robos_publico to anon, authenticated;
