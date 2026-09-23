-- =============================================================================
-- 0023 · Exposição do dia medida com as regras públicas (DeltaReporter 1.1.1)
--   Problema (23/09/2026, em produção): o site esconde por regra algumas
--   operações do robô (robos.hora_minima_operacao; robos.duracao_minima_seg a
--   partir de duracao_minima_desde, que tira as "operações fantasma" de 0 s da
--   conta demo: hoje 306 de 332 do Apollo). O EA 1.1.0 media o MEP/MEN do dia
--   sobre o saldo REAL do magic, tudo incluído, então exposicao_dia vinha com
--   um MEP de ganho fantasma, e exposicao_dia_publico (0021, item 7) descarta o
--   dia inteiro quando existe operação fora da conta pública: na prática o
--   MEP/MEN do EA nunca aparecia para o Apollo.
--   Solução: o EA 1.1.1 recebe as regras no GET /api/ingest/ping (função
--   regras_publicas_da_conta: um item por magic da conta, com hora_minima,
--   duracao_minima_seg, duracao_minima_desde e a "versao" da regra) e aplica
--   as MESMAS regras ao calcular a exposição do dia; cada item de exposicao_dia
--   leva "regras_aplicadas": true e "regras_versao" quando o EA tinha a regra
--   do magic ao calcular (false, ou ausente, quando calculou sem ela: 1.1.0, ou
--   1.1.1 com o ping falhando no init).
--   Regras:
--   - regras_publicas_versao(hora, duracao, desde) devolve o texto
--     "HH:MM:SS|duracao|desde" ('' em cada parte nula) e é calculada SÓ aqui:
--     o ping manda ao EA, o EA ecoa em cada item e a view compara com a regra
--     do robô AGORA. Regra alterada no admin no meio do pregão => a versão
--     gravada não bate => a linha some da view até o EA (que confere as regras
--     a cada 10 min) refazer o dia com a regra nova e mandar a versão nova,
--     que SUBSTITUI a linha. Sem isso o MEP medido com a regra velha ficaria
--     publicado ao lado de uma curva pública já recalculada, e um greatest()
--     nunca deixaria o MEP velho baixar.
--   - exposicao_dia.regras_aplicadas boolean not null default false e
--     exposicao_dia.regras_versao text (nula sem regras). Linha existente
--     (medida pelo 1.1.0) fica false/nula.
--   - atualizar_heartbeat: no insert grava o que veio. No update, item COM
--     regras sobre linha SEM regras, ou com versão DIFERENTE da gravada, é
--     SUBSTITUÍDO (mep/men, horários, contagens, n_saidas, realizado, parcial
--     e versão = os do item) e marcado regras_aplicadas = true. Mesma versão
--     (ou as duas sem regras): greatest/least como na 0021. Item SEM regras
--     sobre linha COM regras é ignorado: a marca é grudenta (e or excluded) e
--     misturar um saldo com tudo incluído a um saldo público estragaria a
--     linha; caso raro (EA voltou ao 1.1.0, ou o 1.1.1 reiniciou sem conseguir
--     o ping) e o próximo item com regras retoma.
--   - exposicao_dia_publico: por magic, "publicável" = (regras_aplicadas e a
--     versão gravada é a da regra atual do robô) ou (sem regras e nenhuma
--     operação do robô na conta principal fora de operacoes_publico no dia,
--     como na 0021). Robô com algum magic não publicável no dia some INTEIRO
--     (having bool_and): omitir só o magic faria max/min saírem de metade do
--     robô com n_magics = 1 e regras_aplicadas = true sem sinal disso. A
--     exclusão por importação manual no dia continua para todos. Coluna nova
--     regras_aplicadas no FIM (bool_and: true só se todos os magics do robô
--     mediram com regras).
--   - broadcast_coleta não muda (lê a view pelo nome das colunas).
--   - Compatibilidade: EA 1.1.0 (sem os campos) continua aceito e comporta-se
--     como antes.
-- =============================================================================

alter table public.exposicao_dia
  add column if not exists regras_aplicadas boolean not null default false;
alter table public.exposicao_dia
  add column if not exists regras_versao text;
comment on column public.exposicao_dia.regras_aplicadas is
  'true = o EA (1.1.1+) mediu o dia já aplicando a regra pública do magic recebida do servidor (hora mínima, duração mínima): o saldo é o público. false = saldo real do magic (EA 1.1.0), só publicável em dia sem operação escondida. Grudenta: um item sem regras não a apaga.';
comment on column public.exposicao_dia.regras_versao is
  'Versão da regra (regras_publicas_versao) que o EA aplicou ao medir, ecoada do ping. A view só publica a linha cuja versão bate com a regra atual do robô; item com versão diferente substitui a linha. Nula sem regras.';

-- -----------------------------------------------------------------------------
-- 1. regras_publicas_versao: texto que identifica a regra pública de um robô.
--    Única definição: usada pelo ping (regras_publicas_da_conta) e pela view.
--    '' em cada parte nula, então nunca é nula ("||" = sem regra nenhuma).
--    Duração zero ou negativa é "sem duração mínima", e o desde só vale junto
--    de uma duração (mesma normalização do site).
-- -----------------------------------------------------------------------------
create or replace function public.regras_publicas_versao(
  p_hora    time,
  p_duracao integer,
  p_desde   date
)
returns text
language sql
stable
as $$
  select concat_ws('|',
           coalesce(to_char(p_hora::interval, 'HH24:MI:SS'), ''),
           case when coalesce(p_duracao, 0) > 0 then p_duracao::text else '' end,
           case when coalesce(p_duracao, 0) > 0 and p_desde is not null
                then to_char(p_desde, 'YYYY-MM-DD') else '' end);
$$;

comment on function public.regras_publicas_versao(time, integer, date) is
  'Versão textual da regra pública de um robô ("HH:MM:SS|duracao_minima_seg|duracao_minima_desde", partes nulas vazias). O ping manda ao EA, o EA ecoa em exposicao_dia.regras_versao e exposicao_dia_publico compara com a regra atual.';

-- -----------------------------------------------------------------------------
-- 2. regras_publicas_da_conta(conta): o que o GET /api/ingest/ping devolve ao
--    EA. Um item por magic mapeado para a conta cujo robô tem esta conta como
--    principal (o EA de conta secundária não recebe regra nenhuma, como o site
--    também não publica nada dela). Sem numero_conta. Só service_role.
-- -----------------------------------------------------------------------------
create or replace function public.regras_publicas_da_conta(p_conta_id uuid)
returns table (
  magic                bigint,
  slug                 text,
  conta_principal_id   uuid,
  hora_minima_operacao time,
  duracao_minima_seg   integer,
  duracao_minima_desde date,
  versao               text
)
language sql
stable
security definer
set search_path = public
as $$
  select m.magic,
         r.slug,
         r.conta_principal_id,
         r.hora_minima_operacao,
         r.duracao_minima_seg,
         r.duracao_minima_desde,
         public.regras_publicas_versao(r.hora_minima_operacao, r.duracao_minima_seg, r.duracao_minima_desde)
    from public.robo_conta_magic m
    join public.robos r on r.id = m.robo_id and r.conta_principal_id = m.conta_id
   where m.conta_id = p_conta_id
   order by r.slug, m.magic;
$$;

revoke all on function public.regras_publicas_da_conta(uuid) from public, anon, authenticated;
grant execute on function public.regras_publicas_da_conta(uuid) to service_role;

comment on function public.regras_publicas_da_conta(uuid) is
  'Regras públicas por magic da conta (hora mínima, duração mínima, desde e versão) que o EA 1.1.1 recebe no ping e aplica ao medir MEP/MEN. Só robôs cuja conta principal é esta. Só service_role.';

-- -----------------------------------------------------------------------------
-- 3. atualizar_heartbeat: definição da 0021 inteira + regras_aplicadas e
--    regras_versao no passo 0 (insert; substituição na primeira chegada com
--    regras ou quando a versão muda; greatest/least depois). Passos 1 a 5
--    iguais.
--    p = { ea_versao, em, balance, equity, posicoes: [...], cotacoes: [...],
--          exposicao_dia: [{magic, dia, realizado, flutuante, n_saidas, mep,
--          mep_em, mep_n_saidas, men, men_em, men_n_saidas, parcial,
--          regras_aplicadas, regras_versao}] }
-- -----------------------------------------------------------------------------
create or replace function public.atualizar_heartbeat(p_conta_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_em         timestamptz := coalesce(nullif(p ->> 'em', '')::timestamptz, now());
  v_posicoes   jsonb := coalesce(p -> 'posicoes', '[]'::jsonb);
  v_cotacoes   jsonb := coalesce(p -> 'cotacoes', '[]'::jsonb);
  v_exposicao  jsonb := case when jsonb_typeof(p -> 'exposicao_dia') = 'array'
                             then p -> 'exposicao_dia' else '[]'::jsonb end;
  v_hoje       date := public.dia_pregao_de(now());
begin
  -- 0. MEP/MEN do dia por magic (EA 1.1.0+). Só dias em volta de hoje: o dia é
  --    o do servidor do MT5 e pode diferir de Brasília na virada.
  insert into public.exposicao_dia as e
    (conta_id, magic, dia, mep_brl_por_contrato, men_brl_por_contrato,
     mep_em, men_em, mep_n_saidas, men_n_saidas, n_saidas,
     realizado_brl_por_contrato, parcial, regras_aplicadas, regras_versao, atualizado_em)
  select
    p_conta_id,
    i.magic,
    i.dia,
    i.mep,
    i.men,
    case when i.mep > 0 then i.mep_em end,
    case when i.men < 0 then i.men_em end,
    case when i.mep > 0 then i.mep_n_saidas end,
    case when i.men < 0 then i.men_n_saidas end,
    i.n_saidas,
    i.realizado,
    i.parcial,
    i.regras_aplicadas,
    case when i.regras_aplicadas then i.regras_versao end,
    now()
  from (
    -- distinct on: o mesmo (magic, dia) duas vezes no lote derrubaria o
    -- ON CONFLICT DO UPDATE; fica o item com regras e, entre iguais, o de
    -- maior MEP (empate: menor MEN).
    select distinct on (magic, dia)
      case when (x ->> 'magic') ~ '^[0-9]{1,18}$' then (x ->> 'magic')::bigint end          as magic,
      case when (x ->> 'dia') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (x ->> 'dia')::date end  as dia,
      greatest(0, coalesce((x ->> 'mep')::numeric, 0))                                        as mep,
      least(0, coalesce((x ->> 'men')::numeric, 0))                                           as men,
      nullif(x ->> 'mep_em', '')::timestamptz                                                 as mep_em,
      nullif(x ->> 'men_em', '')::timestamptz                                                 as men_em,
      (x ->> 'mep_n_saidas')::integer                                                          as mep_n_saidas,
      (x ->> 'men_n_saidas')::integer                                                          as men_n_saidas,
      coalesce((x ->> 'n_saidas')::integer, 0)                                                 as n_saidas,
      coalesce((x ->> 'realizado')::numeric, 0)                                                as realizado,
      coalesce((x ->> 'parcial')::boolean, false)                                              as parcial,
      coalesce((x ->> 'regras_aplicadas')::boolean, false)                                     as regras_aplicadas,
      nullif(x ->> 'regras_versao', '')                                                        as regras_versao
    from jsonb_array_elements(v_exposicao) x
    where jsonb_typeof(x) = 'object'
    order by magic, dia, regras_aplicadas desc, mep desc, men asc
  ) i
  where i.magic is not null
    and i.dia is not null
    and i.dia between v_hoje - 1 and v_hoje + 1
  on conflict (conta_id, magic, dia) do update set
    -- substitui tudo quando o item COM regras chega numa linha SEM regras ou
    -- medida com outra versão da regra; senão, monotônico como na 0021
    mep_em                     = case
                                   when excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao) then excluded.mep_em
                                   when excluded.mep_brl_por_contrato > e.mep_brl_por_contrato then excluded.mep_em
                                   when excluded.mep_brl_por_contrato = e.mep_brl_por_contrato then coalesce(e.mep_em, excluded.mep_em)
                                   else e.mep_em
                                 end,
    mep_n_saidas               = case
                                   when excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao) then excluded.mep_n_saidas
                                   when excluded.mep_brl_por_contrato > e.mep_brl_por_contrato then excluded.mep_n_saidas
                                   when excluded.mep_brl_por_contrato = e.mep_brl_por_contrato then coalesce(e.mep_n_saidas, excluded.mep_n_saidas)
                                   else e.mep_n_saidas
                                 end,
    men_em                     = case
                                   when excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao) then excluded.men_em
                                   when excluded.men_brl_por_contrato < e.men_brl_por_contrato then excluded.men_em
                                   when excluded.men_brl_por_contrato = e.men_brl_por_contrato then coalesce(e.men_em, excluded.men_em)
                                   else e.men_em
                                 end,
    men_n_saidas               = case
                                   when excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao) then excluded.men_n_saidas
                                   when excluded.men_brl_por_contrato < e.men_brl_por_contrato then excluded.men_n_saidas
                                   when excluded.men_brl_por_contrato = e.men_brl_por_contrato then coalesce(e.men_n_saidas, excluded.men_n_saidas)
                                   else e.men_n_saidas
                                 end,
    mep_brl_por_contrato       = case
                                   when excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao) then excluded.mep_brl_por_contrato
                                   else greatest(e.mep_brl_por_contrato, excluded.mep_brl_por_contrato)
                                 end,
    men_brl_por_contrato       = case
                                   when excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao) then excluded.men_brl_por_contrato
                                   else least(e.men_brl_por_contrato, excluded.men_brl_por_contrato)
                                 end,
    n_saidas                   = excluded.n_saidas,
    realizado_brl_por_contrato = excluded.realizado_brl_por_contrato,
    parcial                    = case
                                   when excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao) then excluded.parcial
                                   else e.parcial or excluded.parcial
                                 end,
    regras_aplicadas           = e.regras_aplicadas or excluded.regras_aplicadas,
    regras_versao              = case
                                   when excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao) then excluded.regras_versao
                                   else e.regras_versao
                                 end,
    atualizado_em              = now()
  where (excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao))
     or (excluded.regras_aplicadas = e.regras_aplicadas
         and excluded.regras_versao is not distinct from e.regras_versao
         and (
            excluded.mep_brl_por_contrato > e.mep_brl_por_contrato
         or excluded.men_brl_por_contrato < e.men_brl_por_contrato
         or excluded.n_saidas is distinct from e.n_saidas
         or excluded.realizado_brl_por_contrato is distinct from e.realizado_brl_por_contrato
         or (not e.parcial and excluded.parcial)
         or (e.mep_em is null and excluded.mep_em is not null and excluded.mep_brl_por_contrato = e.mep_brl_por_contrato)
         or (e.men_em is null and excluded.men_em is not null and excluded.men_brl_por_contrato = e.men_brl_por_contrato)
         or (e.mep_n_saidas is null and excluded.mep_n_saidas is not null and excluded.mep_brl_por_contrato = e.mep_brl_por_contrato)
         or (e.men_n_saidas is null and excluded.men_n_saidas is not null and excluded.men_brl_por_contrato = e.men_brl_por_contrato)));
     -- item SEM regras sobre linha COM regras não casa com nenhum ramo: ignorado

  -- 1. status do coletor
  insert into public.coleta_status as cs
    (conta_id, ultimo_heartbeat, versao_ea, balance, equity, n_posicoes, atualizado_em)
  values (
    p_conta_id, now(), nullif(p ->> 'ea_versao', ''),
    nullif(p ->> 'balance', '')::numeric, nullif(p ->> 'equity', '')::numeric,
    jsonb_array_length(v_posicoes), now()
  )
  on conflict (conta_id) do update set
    ultimo_heartbeat = now(),
    versao_ea        = coalesce(excluded.versao_ea, cs.versao_ea),
    balance          = coalesce(excluded.balance, cs.balance),
    equity           = coalesce(excluded.equity, cs.equity),
    n_posicoes       = excluded.n_posicoes,
    atualizado_em    = now();

  -- 2. posições: remove as que sumiram
  delete from public.posicoes_abertas pa
   where pa.conta_id = p_conta_id
     and not exists (
       select 1 from jsonb_array_elements(v_posicoes) x
        where (x ->> 'ticket')::bigint = pa.ticket
     );

  -- 3. posições: upsert das presentes
  insert into public.posicoes_abertas as pa
    (conta_id, ticket, robo_id, magic, simbolo, lado, volume, preco_abertura,
     lucro_flutuante, aberta_em, atualizado_em)
  select
    p_conta_id,
    (x ->> 'ticket')::bigint,
    public.robo_por_magic(p_conta_id, coalesce((x ->> 'magic')::bigint, 0)),
    coalesce((x ->> 'magic')::bigint, 0),
    x ->> 'simbolo',
    (x ->> 'lado')::public.lado_operacao,
    (x ->> 'volume')::numeric,
    (x ->> 'preco_abertura')::numeric,
    coalesce((x ->> 'lucro_flutuante')::numeric, 0),
    coalesce(nullif(x ->> 'aberta_em', '')::timestamptz, now()),
    now()
  from jsonb_array_elements(v_posicoes) x
  on conflict (conta_id, ticket) do update set
    robo_id          = excluded.robo_id,
    magic            = excluded.magic,
    simbolo          = excluded.simbolo,
    lado             = excluded.lado,
    volume           = excluded.volume,
    preco_abertura   = excluded.preco_abertura,
    lucro_flutuante  = excluded.lucro_flutuante,
    aberta_em        = least(pa.aberta_em, excluded.aberta_em),
    atualizado_em    = now();

  -- 3b. excursões das posições abertas (EA 1.1.0: itens com mfe_pontos ou
  --     mae_pontos; um malformado não perde o outro). O item traz ticket e,
  --     quando o EA sabe, posicao_id e ciclo; o registrar_excursoes usa
  --     posicao_id e cai no ticket se faltar.
  perform public.registrar_excursoes(
    p_conta_id,
    (select coalesce(jsonb_agg(x), '[]'::jsonb)
       from jsonb_array_elements(v_posicoes) x
      where jsonb_typeof(x) = 'object' and ((x ? 'mfe_pontos') or (x ? 'mae_pontos')))
  );

  -- 4. snapshot: 1 por minuto
  if (p ? 'balance') and (p ? 'equity') then
    insert into public.snapshots_conta (conta_id, balance, equity, em, minuto)
    values (p_conta_id, (p ->> 'balance')::numeric, (p ->> 'equity')::numeric,
            v_em, date_trunc('minute', v_em))
    on conflict (conta_id, minuto) do nothing;
  end if;

  -- 5. cotações
  insert into public.cotacoes as c (simbolo, prefixo_simbolo, preco, fechamento_anterior, em)
  select
    upper(x ->> 'simbolo'),
    public.prefixo_de_simbolo(x ->> 'simbolo'),
    (x ->> 'preco')::numeric,
    nullif(x ->> 'fechamento_anterior', '')::numeric,
    now()
  from jsonb_array_elements(v_cotacoes) x
  where public.prefixo_de_simbolo(x ->> 'simbolo') is not null
    and (x ->> 'preco')::numeric > 0
  on conflict (simbolo) do update set
    preco               = excluded.preco,
    fechamento_anterior = coalesce(excluded.fechamento_anterior, c.fechamento_anterior),
    em                  = now();

  return jsonb_build_object('ok', true, 'servidor_em', now());
end;
$$;

revoke all on function public.atualizar_heartbeat(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.atualizar_heartbeat(uuid, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 4. exposicao_dia_publico: definição da 0021 (item 7) com a publicação
--    decidida por magic ("publicavel") e o robô/dia inteiro omitido quando
--    algum magic não pode ser publicado; coluna nova no FIM.
--    - regras_aplicadas = true: publicável só se a versão gravada é a da regra
--      atual do robô (regra alterada no admin => some até o EA remedir).
--    - regras_aplicadas = false (EA 1.1.0): publicável só se nenhuma operação
--      do robô na conta principal ficou fora de operacoes_publico no dia
--      (hora/duração mínima), como na 0021.
--    - Importação manual no dia exclui para todos (a curva pública do dia é a
--      importada, não a do EA).
--    Robô com mais de um magic: max/min entre eles e o horário e a contagem de
--    saídas do magic que fez o extremo; n_magics avisa o front;
--    regras_aplicadas = bool_and (true só se todos os magics mediram com as
--    regras). Sem conta, sem magic, sem volume.
-- -----------------------------------------------------------------------------
create or replace view public.exposicao_dia_publico
with (security_invoker = false)
as
with por_magic as (
  select
    r.id   as robo_id,
    r.slug,
    x.dia,
    x.magic,
    x.mep_brl_por_contrato,
    x.men_brl_por_contrato,
    x.mep_em,
    x.men_em,
    x.mep_n_saidas,
    x.men_n_saidas,
    x.parcial,
    x.regras_aplicadas,
    case
      when x.regras_aplicadas then
        -- medido com regras: só se foram as regras que o robô tem AGORA
        coalesce(
          x.regras_versao = public.regras_publicas_versao(r.hora_minima_operacao, r.duracao_minima_seg, r.duracao_minima_desde),
          false)
      else
        -- sem regras (EA 1.1.0): só dia em que nenhuma operação do robô na
        -- conta principal ficou fora de operacoes_publico (hora/duração mínima)
        not exists (
          select 1 from public.operacoes o
           where o.robo_id = r.id
             and o.dia_pregao = x.dia
             and o.conta_id = x.conta_id
             and not exists (select 1 from public.operacoes_publico op where op.id = o.id)
        )
    end as publicavel
  from public.exposicao_dia x
  join public.robo_conta_magic m on m.conta_id = x.conta_id and m.magic = x.magic
  join public.robos r on r.id = m.robo_id and r.conta_principal_id = x.conta_id
  where not exists (
          -- importação manual no dia: a curva pública é a importada, para todos
          select 1 from public.operacoes o
           where o.robo_id = r.id
             and o.dia_pregao = x.dia
             and o.origem = 'manual'
        )
)
select
  robo_id,
  slug,
  dia,
  max(mep_brl_por_contrato)                                                   as mep_ea,
  min(men_brl_por_contrato)                                                   as men_ea,
  (array_agg(mep_em       order by mep_brl_por_contrato desc, magic))[1]      as mep_ea_em,
  (array_agg(men_em       order by men_brl_por_contrato asc,  magic))[1]      as men_ea_em,
  (array_agg(mep_n_saidas order by mep_brl_por_contrato desc, magic))[1]      as mep_ea_n_saidas,
  (array_agg(men_n_saidas order by men_brl_por_contrato asc,  magic))[1]      as men_ea_n_saidas,
  bool_or(parcial)                                                            as excursao_ea_parcial,
  count(*)::integer                                                           as n_magics,
  bool_and(regras_aplicadas)                                                  as regras_aplicadas
from por_magic
group by robo_id, slug, dia
having bool_and(publicavel);

grant select on public.exposicao_dia_publico to anon, authenticated;

comment on view public.exposicao_dia_publico is
  'MEP/MEN do dia por robô medidos tick a tick pelo EA (R$ BRUTOS por contrato; líquido = bruto - n_saidas × custo_por_contrato, com n_saidas = ciclos fechados). Existe linha só para dia que o EA mediu, sem importação manual no dia e em que TODOS os magics do robô são publicáveis: medição com regras (EA 1.1.1) só com a versão da regra atual do robô; medição sem regras (EA 1.1.0) só sem operação do robô fora da conta pública (hora/duração mínima). Sem linha, o site calcula por fechamento (excursaoDoDia). Sem conta, magic ou volume.';
comment on column public.exposicao_dia_publico.regras_aplicadas is
  'true = todos os magics do robô mediram o dia já aplicando as regras públicas recebidas do servidor (EA 1.1.1), na versão atual: o saldo medido é o mesmo da curva pública. false = medição do saldo real do magic (EA 1.1.0), publicada só porque nenhuma operação do dia ficou escondida.';
