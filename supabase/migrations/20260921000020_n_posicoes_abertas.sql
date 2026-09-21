-- =============================================================================
-- 0020 · Operações em aberto por robô, contadas em tempo real
--   Pedido (21/09/2026): mostrar quantas operações o robô tem abertas de fato
--   neste momento, na barra e nos cards da home, no painel "Hoje ao vivo" e na
--   tela cheia /robos/[slug]/ao-vivo. Conta-se ENTRADAS ABERTAS: cada ticket
--   (posição) aberto no MT5 vale 1. Nunca volume, nunca contratos: a view
--   agregada da 0010 continua sem volume e nada aqui muda isso.
--
--   Regra de contagem, igual em todos os lugares (é a mesma expressão do
--   booleano posicionado, que continua existindo):
--     conta_id = robos.conta_principal_id
--     and now() >= aberta_em + make_interval(secs => robos.atraso_publico_segundos)
--   Não se usa coleta_status.n_posicoes: é por conta, sem atraso e sem robô.
--
--   O que muda:
--   1. posicoes_abertas_publico ganha n_abertas (tickets do grupo símbolo/lado).
--      O evento "posicao" é to_jsonb da linha, então passa a carregar n_abertas
--      sozinho; "posicao_fechada" continua removendo o grupo.
--   2. robos_publico ganha n_posicoes_abertas (no fim da lista: CREATE OR
--      REPLACE VIEW só aceita coluna nova no fim).
--   3. resumo_casa_hoje(): n_posicoes_abertas por robô e o total na raiz;
--      n_robos_posicionados continua.
--   4. Evento "coleta" (topics casa e robo:<slug>) ganha n_posicoes_abertas.
--   5. broadcast_posicao(): INSERT e DELETE seguem imediatos; o throttle de 10 s
--      continua só para UPDATE de flutuante. Novidade: quando um ticket acaba
--      de passar do atraso público (o heartbeat anterior ainda o via escondido),
--      o UPDATE é tratado como abertura: sem throttle e com o resumo da casa
--      reemitido. Antes, com atraso > 0, a contagem pública mudava sem ninguém
--      reemitir o resumo. E volta a guarda da 0008 que a 0010 tinha perdido:
--      ticket ainda escondido pelo atraso não transmite nada (nem "posicao"
--      fora do ritmo do throttle, que denunciava a entrada antes da hora).
--   O front continua responsável por "nunca mostrar dado velho parecendo vivo":
--   sem heartbeat há mais de 2 min em pregão o contador some, e fora do pregão
--   não aparece (mesmo gating de statusAoVivo/coletaParada do posicionado).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. posicoes_abertas_publico: agregada por (robô, símbolo, lado) + n_abertas
-- -----------------------------------------------------------------------------
create or replace view public.posicoes_abertas_publico
with (security_invoker = false)
as
select
  pa.robo_id,
  r.slug,
  pa.simbolo,
  pa.lado,
  round(sum(pa.volume * pa.preco_abertura) / nullif(sum(pa.volume), 0), 3) as preco_abertura,
  round(sum(pa.lucro_flutuante) / nullif(sum(pa.volume), 0), 2)            as lucro_flutuante_por_contrato,
  min(pa.aberta_em)                                                         as aberta_em,
  max(pa.atualizado_em)                                                     as atualizado_em,
  count(*)::integer                                                         as n_abertas
from public.posicoes_abertas pa
join public.robos r on r.id = pa.robo_id and r.conta_principal_id = pa.conta_id
where now() >= pa.aberta_em + make_interval(secs => r.atraso_publico_segundos)
group by pa.robo_id, r.slug, pa.simbolo, pa.lado;

grant select on public.posicoes_abertas_publico to anon, authenticated;

comment on column public.posicoes_abertas_publico.n_abertas is
  'Quantas entradas (tickets) do robô continuam abertas neste símbolo e lado, já passado o atraso público. Cada ticket conta 1; nunca volume nem contratos.';

-- -----------------------------------------------------------------------------
-- 2. robos_publico: definição da 0018 inteira + n_posicoes_abertas no fim
-- -----------------------------------------------------------------------------
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
  r.duracao_minima_desde,
  (
    select count(*) from public.posicoes_abertas pa
     where pa.robo_id = r.id
       and pa.conta_id = r.conta_principal_id
       and now() >= pa.aberta_em + make_interval(secs => r.atraso_publico_segundos)
  )::integer as n_posicoes_abertas
from public.robos r
join public.multiplicadores m on m.prefixo_simbolo = r.ativo
left join public.coleta_status cs on cs.conta_id = r.conta_principal_id
left join public.contas_matriz cm on cm.id = r.conta_principal_id;

grant select on public.robos_publico to anon, authenticated;

comment on column public.robos_publico.n_posicoes_abertas is
  'Entradas (tickets) abertas agora na conta principal do robô, já passado o atraso público. 0 = sem posição; posicionado = (n_posicoes_abertas > 0). Cada ticket conta 1; nunca volume nem contratos.';

-- -----------------------------------------------------------------------------
-- 3. resumo_casa_hoje(): definição da 0006 inteira + n_posicoes_abertas
--    por robô e o total da casa na raiz
-- -----------------------------------------------------------------------------
create or replace function public.resumo_casa_hoje()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with hoje as (
    select public.dia_pregao_de(now()) as dia
  ),
  por_robo as (
    select
      r.slug,
      r.nome,
      r.status,
      coalesce(e.resultado_brl_por_contrato, 0)                                   as resultado_bruto_por_contrato,
      coalesce(e.resultado_brl_por_contrato, 0) - coalesce(e.custos_brl_por_contrato, 0) as resultado_liquido_por_contrato,
      coalesce(e.pontos_por_contrato, 0)                                          as pontos_por_contrato,
      coalesce(e.n_operacoes, 0)                                                  as n_operacoes,
      coalesce(e.n_gain, 0)                                                       as n_gain,
      (
        select count(*) from public.posicoes_abertas pa
         where pa.robo_id = r.id
           and pa.conta_id = r.conta_principal_id
           and now() >= pa.aberta_em + make_interval(secs => r.atraso_publico_segundos)
      )::integer                                                                  as n_posicoes_abertas
    from public.robos r
    cross join hoje h
    left join public.estatisticas_diarias e on e.robo_id = r.id and e.dia = h.dia
    where r.status in ('ativo', 'pausado')
  )
  select jsonb_build_object(
    'dia', (select dia from hoje),
    'resultado_bruto_por_contrato',   coalesce(sum(resultado_bruto_por_contrato), 0),
    'resultado_liquido_por_contrato', coalesce(sum(resultado_liquido_por_contrato), 0),
    'n_operacoes',                    coalesce(sum(n_operacoes), 0),
    'n_gain',                         coalesce(sum(n_gain), 0),
    'n_robos_posicionados',           count(*) filter (where n_posicoes_abertas > 0),
    'n_posicoes_abertas',             coalesce(sum(n_posicoes_abertas), 0),
    'robos', coalesce(jsonb_agg(jsonb_build_object(
      'slug', slug,
      'nome', nome,
      'status', status,
      'resultado_bruto_por_contrato', resultado_bruto_por_contrato,
      'resultado_liquido_por_contrato', resultado_liquido_por_contrato,
      'pontos_por_contrato', pontos_por_contrato,
      'n_operacoes', n_operacoes,
      'n_gain', n_gain,
      'posicionado', (n_posicoes_abertas > 0),
      'n_posicoes_abertas', n_posicoes_abertas
    ) order by resultado_liquido_por_contrato desc), '[]'::jsonb),
    'gerado_em', now()
  )
  from por_robo;
$$;

grant execute on function public.resumo_casa_hoje() to anon, authenticated;

comment on function public.resumo_casa_hoje() is
  'Resumo público do dia da casa (home e evento "resumo" do topic casa). Cada robô traz n_posicoes_abertas (entradas abertas na conta principal, já passado o atraso público; cada ticket conta 1) e a raiz traz a soma. Sem conta, volume ou token.';

-- -----------------------------------------------------------------------------
-- 4. Evento "coleta": ganha n_posicoes_abertas do robô (conta principal,
--    respeitando o atraso). Throttle de 30 s por robô continua.
-- -----------------------------------------------------------------------------
create or replace function public.broadcast_coleta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r           record;
  v_n_abertas integer;
  v_payload   jsonb;
begin
  for r in
    select rb.slug, rb.id, rb.conta_principal_id, rb.atraso_publico_segundos
      from public.robos rb
     where rb.conta_principal_id = new.conta_id
  loop
    if public.pode_transmitir('coleta:' || r.slug, interval '30 seconds') then
      select count(*) into v_n_abertas
        from public.posicoes_abertas pa
       where pa.robo_id = r.id
         and pa.conta_id = r.conta_principal_id
         and now() >= pa.aberta_em + make_interval(secs => r.atraso_publico_segundos);

      v_payload := jsonb_build_object(
        'slug', r.slug,
        'ultimo_heartbeat_em', new.ultimo_heartbeat,
        'posicionado', (v_n_abertas > 0),
        'n_posicoes_abertas', v_n_abertas
      );
      perform realtime.send(v_payload, 'coleta', 'robo:' || r.slug, true);
      perform realtime.send(v_payload, 'coleta', 'casa', true);
    end if;
  end loop;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Posições: INSERT e DELETE imediatos; throttle de 10 s só no UPDATE de
--    flutuante; ticket que acaba de passar do atraso público conta como
--    abertura (sem throttle, resumo reemitido); ticket ainda escondido pelo
--    atraso não transmite nada.
-- -----------------------------------------------------------------------------
create or replace function public.broadcast_posicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug            text;
  v_atraso          integer;
  v_simbolo         text := coalesce(new.simbolo, old.simbolo);
  v_lado            public.lado_operacao := coalesce(new.lado, old.lado);
  v_publica_desde   timestamptz;
  v_mudou_contagem  boolean;
  v_payload         jsonb;
begin
  select r.slug, r.atraso_publico_segundos into v_slug, v_atraso
    from public.robos r
   where r.id = coalesce(new.robo_id, old.robo_id)
     and r.conta_principal_id = coalesce(new.conta_id, old.conta_id);

  if v_slug is null then
    return null;  -- conta secundária ou magic não atribuído: nada público
  end if;

  -- A contagem pública muda quando um ticket já visível entra ou sai, ou quando
  -- um ticket acaba de passar do atraso: a escrita anterior (old.atualizado_em,
  -- que heartbeat e ingest de deal sempre avançam) ainda o via escondido e
  -- agora ele aparece na view.
  if tg_op = 'INSERT' then
    v_mudou_contagem := now() >= new.aberta_em + make_interval(secs => v_atraso);
  elsif tg_op = 'DELETE' then
    v_mudou_contagem := now() >= old.aberta_em + make_interval(secs => v_atraso);
  else
    v_publica_desde  := new.aberta_em + make_interval(secs => v_atraso);
    v_mudou_contagem := old.atualizado_em < v_publica_desde and now() >= v_publica_desde;
  end if;

  -- Ticket ainda dentro do atraso público (e que não acabou de cruzá-lo) não está na view: nada muda
  -- para o anon e nada se transmite. Sem esta guarda (a 0008 tinha, a 0010 perdeu), o INSERT ou DELETE
  -- de uma entrada escondida num grupo que já tem entrada pública pulava o throttle e disparava um
  -- "posicao" fora do ritmo de 10 s, denunciando a entrada antes do atraso; o UPDATE escondido gastava a
  -- chave do throttle das entradas públicas; e o DELETE de um grupo só escondido emitia "posicao_fechada"
  -- de um grupo que o front nunca teve. É seguro pular: a visibilidade só cresce com o tempo (aberta_em
  -- só diminui, via least()), então um ticket escondido agora nunca esteve na view e não há o que
  -- remover. O cruzamento do atraso continua tratado como abertura (v_mudou_contagem passa reto).
  if not v_mudou_contagem
     and now() < coalesce(new.aberta_em, old.aberta_em) + make_interval(secs => v_atraso) then
    return null;
  end if;

  -- só o flutuante mudou: limita a frequência
  if tg_op = 'UPDATE'
     and not v_mudou_contagem
     and new.lado = old.lado
     and new.volume = old.volume
     and new.preco_abertura = old.preco_abertura
  then
    if not public.pode_transmitir('posicao:' || v_slug || ':' || v_simbolo || ':' || v_lado::text,
                                  interval '10 seconds') then
      return null;
    end if;
  end if;

  select to_jsonb(p) into v_payload
    from public.posicoes_abertas_publico p
   where p.slug = v_slug and p.simbolo = v_simbolo and p.lado = v_lado;

  if v_payload is null then
    -- nada aberto nesse símbolo/lado (ou ainda dentro do atraso público)
    if tg_op = 'DELETE' then
      perform realtime.send(
        jsonb_build_object('slug', v_slug, 'simbolo', v_simbolo, 'lado', v_lado),
        'posicao_fechada', 'robo:' || v_slug, true);
      if v_mudou_contagem then
        perform realtime.send(public.resumo_casa_hoje(), 'resumo', 'casa', true);
      end if;
    end if;
    return null;
  end if;

  perform realtime.send(v_payload, 'posicao', 'robo:' || v_slug, true);
  if v_mudou_contagem then
    perform realtime.send(public.resumo_casa_hoje(), 'resumo', 'casa', true);
  end if;
  return null;
end;
$$;

-- O trigger já existia desde a 0008 (insert, update e delete, por linha);
-- recriado aqui só para deixar a garantia registrada nesta migration.
drop trigger if exists posicoes_abertas_broadcast on public.posicoes_abertas;
create trigger posicoes_abertas_broadcast
  after insert or update or delete on public.posicoes_abertas
  for each row execute function public.broadcast_posicao();
