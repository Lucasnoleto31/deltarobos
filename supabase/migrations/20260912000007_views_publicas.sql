-- =============================================================================
-- 0007 · Views públicas. É a ÚNICA coisa que anon lê.
--
-- As views rodam como dono (security_invoker = false, padrão do Postgres),
-- por isso anon enxerga a view sem ter grant nas tabelas. O advisor do
-- Supabase aponta "security definer view"; é intencional e coberto por teste:
-- nenhuma view pública expõe conta, volume real, token ou número de conta.
-- =============================================================================

-- Robôs com status ao vivo agregado. Inclui arquivados (a home filtra;
-- a URL do robô continua funcionando).
create view public.robos_publico
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
  )                     as posicionado
from public.robos r
join public.multiplicadores m on m.prefixo_simbolo = r.ativo
left join public.coleta_status cs on cs.conta_id = r.conta_principal_id;

-- Operações da conta principal, normalizadas por contrato. Sem conta, sem volume.
create view public.operacoes_publico
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
  o.dia_pregao
from public.operacoes o
join public.robos r on r.id = o.robo_id and r.conta_principal_id = o.conta_id;

-- Posição aberta da conta principal, respeitando o atraso configurado.
create view public.posicoes_abertas_publico
with (security_invoker = false)
as
select
  pa.robo_id,
  r.slug,
  pa.simbolo,
  pa.lado,
  pa.preco_abertura,
  round(pa.lucro_flutuante / nullif(pa.volume, 0), 2) as lucro_flutuante_por_contrato,
  pa.aberta_em,
  pa.atualizado_em
from public.posicoes_abertas pa
join public.robos r on r.id = pa.robo_id and r.conta_principal_id = pa.conta_id
where now() >= pa.aberta_em + make_interval(secs => r.atraso_publico_segundos);

-- Série diária por robô
create view public.estatisticas_publico
with (security_invoker = false)
as
select
  e.robo_id,
  r.slug,
  e.dia,
  e.pontos_por_contrato,
  e.resultado_brl_por_contrato,
  e.custos_brl_por_contrato,
  e.n_operacoes,
  e.n_gain,
  e.n_loss,
  e.soma_gain_brl_por_contrato,
  e.soma_loss_brl_por_contrato,
  e.maior_gain_brl_por_contrato,
  e.maior_loss_brl_por_contrato,
  e.atualizado_em
from public.estatisticas_diarias e
join public.robos r on r.id = e.robo_id;

-- Comunicados publicados e marcados como públicos
create view public.comunicados_publico
with (security_invoker = false)
as
select id, titulo, corpo, publicado_em
from public.comunicados
where publico and publicado_em is not null and publicado_em <= now();

-- Mercado: valor do ponto, horário de pregão e última cotação por prefixo
create view public.mercado_publico
with (security_invoker = false)
as
select
  m.prefixo_simbolo,
  m.nome,
  m.valor_ponto_brl,
  m.margem_referencia,
  m.pregao_inicio,
  m.pregao_fim,
  c.simbolo,
  c.preco,
  c.fechamento_anterior,
  case
    when c.fechamento_anterior > 0
    then round((c.preco - c.fechamento_anterior) / c.fechamento_anterior * 100, 2)
  end as variacao_pct,
  c.em as cotacao_em
from public.multiplicadores m
left join lateral (
  select * from public.cotacoes c
   where c.prefixo_simbolo = m.prefixo_simbolo
   order by c.em desc
   limit 1
) c on true;

-- Feriados (pra calcular dia de pregão no cliente)
create view public.feriados_publico
with (security_invoker = false)
as
select dia, descricao from public.feriados_b3;

-- Parâmetros marcados como públicos (links, textos, fator de segurança)
create view public.parametros_publico
with (security_invoker = false)
as
select chave, valor from public.parametros where publico;
