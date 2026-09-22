-- =============================================================================
-- 0021 · Excursões medidas pelo EA (DeltaReporter 1.1.0)
--   Pedido (22/09/2026): o site passa a mostrar números que só o terminal vê
--   tick a tick, sem que o servidor precise acompanhar o mercado:
--   1. MFE/MAE por operação: máxima excursão a favor e contra, em PONTOS por
--      contrato, medida pelo EA enquanto a posição vive. Tabela
--      excursoes_posicao, com a mesma chave natural de operacoes
--      (conta, posição, ciclo): a operação nasce com o join preenchido.
--   2. MEP/MEN do dia por magic: máximo e mínimo que o saldo do dia (realizado
--      das saídas + flutuante das posições do magic, em R$ BRUTOS por contrato)
--      atingiu, medido tick a tick. Tabela exposicao_dia. É o número do Profit.
--      O cálculo por fechamento (excursaoDoDia, no site) continua como reserva
--      para os dias em que o EA 1.1.0 não mediu.
--   Regras:
--   - O EA 1.0.0 pode continuar em alguma conta: nenhum campo novo é
--     obrigatório; sem eles, nada muda.
--   - Excursão é medição paralela: nunca cria nem altera operação; entra por
--     LEFT JOIN nas views. Perder uma excursão nunca perde um deal.
--   - Medição é monotônica: MFE só sobe, MAE só desce, MEP só sobe, MEN só
--     desce (greatest/least no upsert). Heartbeat, deal e reenvio podem chegar
--     em qualquer ordem e repetidos. O horário do extremo acompanha o valor:
--     troca quando o valor sobe (ou desce, no MAE/MEN); com valor igual só
--     preenche se estava vazio (o heartbeat não manda mfe_em/mae_em; o deal
--     manda, e chega depois com o mesmo valor).
--   - parcial = true quando o EA não viu a posição (ou o dia) desde o começo
--     (subiu no meio). É "grudento" (e.parcial OR excluded.parcial): a linha
--     agrega várias vidas do EA e todo reinício tem um buraco de ticks; uma
--     fonte só atesta completude da PRÓPRIA vida, então um false nunca corrige
--     um true anterior. (O EA guarda o parcial nas GlobalVariables e o traz de
--     volta no init, logo não existe false legítimo depois de um true.)
--   - n_saidas, mep_n_saidas e men_n_saidas contam CICLOS fechados (= operações
--     do site), não deals: saída parcial em dois deals é uma operação e um
--     custo só (líquido = bruto - n × custo_por_contrato; marcador na curva em
--     n / n_operações).
--   - Item de excursão sem ciclo é ignorado: o default 1 fundiria a medição do
--     ciclo 2 de uma posição revertida na linha monotônica do ciclo 1 (o EA
--     1.1.0 sempre manda o ciclo junto do mfe/mae).
--   - MEP nunca fica negativo nem MEN positivo (spec §7: se o saldo nunca ficou
--     positivo, MEP = 0 e não há operação do MEP); o upsert corta em 0 e
--     apaga o horário/contagem quando o extremo é 0.
--   - Público: só pontos, R$ por contrato, horários e contagem de saídas.
--     Nunca conta, volume, magic ou número de conta. Colunas novas só no FIM
--     das views (CREATE OR REPLACE VIEW).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. excursoes_posicao: MFE/MAE por (conta, posição, ciclo), em pontos
-- -----------------------------------------------------------------------------
create table public.excursoes_posicao (
  conta_id       uuid not null references public.contas_matriz (id) on delete cascade,
  posicao_id     bigint not null,
  ciclo          smallint not null default 1,
  magic          bigint,
  simbolo        text,
  mfe_pontos     numeric(14, 3) not null default 0 check (mfe_pontos >= 0),
  mae_pontos     numeric(14, 3) not null default 0 check (mae_pontos <= 0),
  mfe_em         timestamptz,
  mae_em         timestamptz,
  parcial        boolean not null default false,
  atualizado_em  timestamptz not null default now(),
  primary key (conta_id, posicao_id, ciclo)
);
comment on table public.excursoes_posicao is
  'MFE/MAE por posição e ciclo, em PONTOS por contrato, medidos tick a tick pelo EA 1.1.0. Mesma chave natural de operacoes; entra por left join nas views. Privada.';
comment on column public.excursoes_posicao.mfe_pontos is 'Máxima excursão a favor (>= 0), em pontos, desde a abertura do ciclo.';
comment on column public.excursoes_posicao.mae_pontos is 'Máxima excursão contra (<= 0), em pontos, desde a abertura do ciclo.';
comment on column public.excursoes_posicao.parcial is 'true = o EA não acompanhou a posição desde a abertura (subiu no meio); o extremo pode ter passado sem ser visto.';
comment on column public.excursoes_posicao.atualizado_em is 'Última mudança real (extremo novo, horário preenchido ou parcial marcado). Reenvio igual não escreve.';

-- -----------------------------------------------------------------------------
-- 2. exposicao_dia: MEP/MEN do dia por (conta, magic), em R$ brutos por contrato
-- -----------------------------------------------------------------------------
create table public.exposicao_dia (
  conta_id                    uuid not null references public.contas_matriz (id) on delete cascade,
  magic                       bigint not null,
  dia                         date not null,
  mep_brl_por_contrato        numeric(14, 4) not null default 0 check (mep_brl_por_contrato >= 0),
  men_brl_por_contrato        numeric(14, 4) not null default 0 check (men_brl_por_contrato <= 0),
  mep_em                      timestamptz,
  men_em                      timestamptz,
  mep_n_saidas                integer,
  men_n_saidas                integer,
  n_saidas                    integer not null default 0,
  realizado_brl_por_contrato  numeric(14, 4) not null default 0,
  parcial                     boolean not null default false,
  atualizado_em               timestamptz not null default now(),
  primary key (conta_id, magic, dia)
);
create index exposicao_dia_dia_idx on public.exposicao_dia (dia);
comment on table public.exposicao_dia is
  'MEP/MEN do dia por (conta, magic), em R$ BRUTOS por contrato, medidos tick a tick pelo EA 1.1.0 (realizado das saídas do dia + flutuante das posições do magic). Privada; o público vem de exposicao_dia_publico.';
comment on column public.exposicao_dia.mep_n_saidas is 'Quantos ciclos (operações do site, não deals) do dia já tinham fechado quando o MEP ocorreu (posição do marcador na curva; líquido = bruto - n × custo_por_contrato).';
comment on column public.exposicao_dia.men_n_saidas is 'Idem para o MEN.';
comment on column public.exposicao_dia.n_saidas is 'Ciclos fechados (operações) do dia contados pelo EA no último heartbeat. Saída parcial em dois deals conta 1.';
comment on column public.exposicao_dia.realizado_brl_por_contrato is 'Resultado realizado do dia (bruto, por contrato) no último heartbeat. Informativo; a série oficial continua em estatisticas_diarias.';
comment on column public.exposicao_dia.parcial is 'true = o EA subiu com o dia já em andamento e não viu todos os ticks (o extremo pode ter passado sem ser visto).';

-- -----------------------------------------------------------------------------
-- 3. registrar_excursoes(conta, itens): upsert monotônico
--    p = item ou lista de itens; cada item aceita as chaves do deal
--    ({posicao_id, ciclo, magic, simbolo, mfe_pontos, mae_pontos, mfe_em,
--    mae_em, excursao_parcial}) ou da posição do heartbeat (ticket no lugar
--    de posicao_id, sem mfe_em/mae_em). Item sem mfe_pontos/mae_pontos, ou
--    sem ciclo, é ignorado. Devolve quantas linhas escreveu (reenvio igual
--    não escreve).
-- -----------------------------------------------------------------------------
create or replace function public.registrar_excursoes(p_conta_id uuid, p jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_itens jsonb := case jsonb_typeof(p)
                     when 'array'  then p
                     when 'object' then jsonb_build_array(p)
                     else '[]'::jsonb
                   end;
  v_n     integer := 0;
begin
  if p_conta_id is null then
    return 0;
  end if;

  insert into public.excursoes_posicao as e
    (conta_id, posicao_id, ciclo, magic, simbolo, mfe_pontos, mae_pontos, mfe_em, mae_em, parcial, atualizado_em)
  select
    p_conta_id,
    i.posicao_id,
    i.ciclo,
    i.magic,
    i.simbolo,
    i.mfe,
    i.mae,
    case when i.mfe > 0 then i.mfe_em end,
    case when i.mae < 0 then i.mae_em end,
    i.parcial,
    now()
  from (
    -- distinct on: o mesmo (posição, ciclo) duas vezes no lote derrubaria o
    -- ON CONFLICT DO UPDATE ("cannot affect row a second time"); fica o item
    -- de maior MFE (e, em empate, de menor MAE).
    select distinct on (posicao_id, ciclo)
      case when coalesce(x ->> 'posicao_id', x ->> 'ticket') ~ '^[0-9]{1,18}$'
           then coalesce(x ->> 'posicao_id', x ->> 'ticket')::bigint end          as posicao_id,
      case when (x ->> 'ciclo') ~ '^[0-9]{1,4}$'
           then (x ->> 'ciclo')::smallint end                                        as ciclo,
      case when (x ->> 'magic') ~ '^[0-9]{1,18}$' then (x ->> 'magic')::bigint end  as magic,
      nullif(upper(trim(x ->> 'simbolo')), '')                                       as simbolo,
      greatest(0, coalesce((x ->> 'mfe_pontos')::numeric, 0))                        as mfe,
      least(0, coalesce((x ->> 'mae_pontos')::numeric, 0))                           as mae,
      nullif(x ->> 'mfe_em', '')::timestamptz                                        as mfe_em,
      nullif(x ->> 'mae_em', '')::timestamptz                                        as mae_em,
      coalesce((coalesce(x ->> 'excursao_parcial', x ->> 'parcial'))::boolean, false) as parcial
    from jsonb_array_elements(v_itens) x
    where jsonb_typeof(x) = 'object'
      and ((x ? 'mfe_pontos') or (x ? 'mae_pontos'))
    order by posicao_id, ciclo, mfe desc, mae asc
  ) i
  where i.posicao_id is not null and i.posicao_id > 0 and i.ciclo is not null
  on conflict (conta_id, posicao_id, ciclo) do update set
    magic         = coalesce(excluded.magic, e.magic),
    simbolo       = coalesce(excluded.simbolo, e.simbolo),
    mfe_em        = case
                      when excluded.mfe_pontos > e.mfe_pontos then excluded.mfe_em
                      when excluded.mfe_pontos = e.mfe_pontos then coalesce(e.mfe_em, excluded.mfe_em)
                      else e.mfe_em
                    end,
    mae_em        = case
                      when excluded.mae_pontos < e.mae_pontos then excluded.mae_em
                      when excluded.mae_pontos = e.mae_pontos then coalesce(e.mae_em, excluded.mae_em)
                      else e.mae_em
                    end,
    mfe_pontos    = greatest(e.mfe_pontos, excluded.mfe_pontos),
    mae_pontos    = least(e.mae_pontos, excluded.mae_pontos),
    parcial       = e.parcial or excluded.parcial,
    atualizado_em = now()
  where excluded.mfe_pontos > e.mfe_pontos
     or excluded.mae_pontos < e.mae_pontos
     or (e.mfe_em is null and excluded.mfe_em is not null and excluded.mfe_pontos = e.mfe_pontos)
     or (e.mae_em is null and excluded.mae_em is not null and excluded.mae_pontos = e.mae_pontos)
     or (not e.parcial and excluded.parcial)
     or (e.magic is null and excluded.magic is not null)
     or (e.simbolo is null and excluded.simbolo is not null);

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.registrar_excursoes(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_excursoes(uuid, jsonb) to service_role;

comment on function public.registrar_excursoes(uuid, jsonb) is
  'Upsert monotônico de MFE/MAE (greatest/least) por (conta, posição, ciclo). Chamada pelo ingest do deal (antes do upsert de operacoes) e pelo heartbeat (posições abertas com mfe_pontos). Só service_role.';

-- -----------------------------------------------------------------------------
-- 4. atualizar_heartbeat: definição da 0006 inteira (a 0020 não a mudou) +
--    passo 0 (exposicao_dia, ANTES do coleta_status, para o evento "coleta"
--    já sair com o MEP/MEN novo) + passo 3b (excursões das posições abertas).
--    p = { ea_versao, em, balance, equity, posicoes: [...], cotacoes: [...],
--          exposicao_dia: [{magic, dia, realizado, flutuante, n_saidas, mep,
--          mep_em, mep_n_saidas, men, men_em, men_n_saidas, parcial}] }
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
  -- 0. MEP/MEN do dia por magic (EA 1.1.0). Só dias em volta de hoje: o dia é
  --    o do servidor do MT5 e pode diferir de Brasília na virada.
  insert into public.exposicao_dia as e
    (conta_id, magic, dia, mep_brl_por_contrato, men_brl_por_contrato,
     mep_em, men_em, mep_n_saidas, men_n_saidas, n_saidas,
     realizado_brl_por_contrato, parcial, atualizado_em)
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
    now()
  from (
    -- distinct on: o mesmo (magic, dia) duas vezes no lote derrubaria o
    -- ON CONFLICT DO UPDATE; fica o item de maior MEP (empate: menor MEN).
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
      coalesce((x ->> 'parcial')::boolean, false)                                              as parcial
    from jsonb_array_elements(v_exposicao) x
    where jsonb_typeof(x) = 'object'
    order by magic, dia, mep desc, men asc
  ) i
  where i.magic is not null
    and i.dia is not null
    and i.dia between v_hoje - 1 and v_hoje + 1
  on conflict (conta_id, magic, dia) do update set
    mep_em                     = case
                                   when excluded.mep_brl_por_contrato > e.mep_brl_por_contrato then excluded.mep_em
                                   when excluded.mep_brl_por_contrato = e.mep_brl_por_contrato then coalesce(e.mep_em, excluded.mep_em)
                                   else e.mep_em
                                 end,
    mep_n_saidas               = case
                                   when excluded.mep_brl_por_contrato > e.mep_brl_por_contrato then excluded.mep_n_saidas
                                   when excluded.mep_brl_por_contrato = e.mep_brl_por_contrato then coalesce(e.mep_n_saidas, excluded.mep_n_saidas)
                                   else e.mep_n_saidas
                                 end,
    men_em                     = case
                                   when excluded.men_brl_por_contrato < e.men_brl_por_contrato then excluded.men_em
                                   when excluded.men_brl_por_contrato = e.men_brl_por_contrato then coalesce(e.men_em, excluded.men_em)
                                   else e.men_em
                                 end,
    men_n_saidas               = case
                                   when excluded.men_brl_por_contrato < e.men_brl_por_contrato then excluded.men_n_saidas
                                   when excluded.men_brl_por_contrato = e.men_brl_por_contrato then coalesce(e.men_n_saidas, excluded.men_n_saidas)
                                   else e.men_n_saidas
                                 end,
    mep_brl_por_contrato       = greatest(e.mep_brl_por_contrato, excluded.mep_brl_por_contrato),
    men_brl_por_contrato       = least(e.men_brl_por_contrato, excluded.men_brl_por_contrato),
    n_saidas                   = excluded.n_saidas,
    realizado_brl_por_contrato = excluded.realizado_brl_por_contrato,
    parcial                    = e.parcial or excluded.parcial,
    atualizado_em              = now()
  where excluded.mep_brl_por_contrato > e.mep_brl_por_contrato
     or excluded.men_brl_por_contrato < e.men_brl_por_contrato
     or excluded.n_saidas is distinct from e.n_saidas
     or excluded.realizado_brl_por_contrato is distinct from e.realizado_brl_por_contrato
     or (not e.parcial and excluded.parcial)
     or (e.mep_em is null and excluded.mep_em is not null and excluded.mep_brl_por_contrato = e.mep_brl_por_contrato)
     or (e.men_em is null and excluded.men_em is not null and excluded.men_brl_por_contrato = e.men_brl_por_contrato)
     or (e.mep_n_saidas is null and excluded.mep_n_saidas is not null and excluded.mep_brl_por_contrato = e.mep_brl_por_contrato)
     or (e.men_n_saidas is null and excluded.men_n_saidas is not null and excluded.men_brl_por_contrato = e.men_brl_por_contrato);

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
-- 5. operacoes_publico: definição da 0019 inteira + left join da excursão do
--    mesmo (conta, posição, ciclo); colunas novas no FIM. Operação manual não
--    tem posicao_id e fica com nulos. Sem conta, sem volume.
-- -----------------------------------------------------------------------------
create or replace view public.operacoes_publico
with (security_invoker = false)
as
select
  o.id, o.robo_id, r.slug, o.simbolo, o.prefixo_simbolo, o.lado,
  o.abertura_em, o.fechamento_em, o.duracao_seg, o.preco_entrada, o.preco_saida,
  o.pontos_por_contrato, o.resultado_brl_por_contrato, o.custos_brl_por_contrato,
  o.versao_robo, o.dia_pregao,
  (o.resultado_brl_por_contrato - o.custos_brl_por_contrato) as resultado_liquido_por_contrato,
  o.origem,
  x.mfe_pontos as mfe_pontos_por_contrato,
  x.mae_pontos as mae_pontos_por_contrato,
  x.mfe_em,
  x.mae_em,
  x.parcial    as excursao_parcial
from public.operacoes o
join public.robos r on r.id = o.robo_id
left join public.excursoes_posicao x
  on x.conta_id = o.conta_id and x.posicao_id = o.posicao_id and x.ciclo = o.ciclo
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
  and (o.origem = 'manual'
       or r.duracao_minima_seg is null
       or o.duracao_seg >= r.duracao_minima_seg
       or (r.duracao_minima_desde is not null and o.dia_pregao < r.duracao_minima_desde));

grant select on public.operacoes_publico to anon, authenticated;

comment on column public.operacoes_publico.mfe_pontos_por_contrato is
  'MFE: máxima excursão a favor, em pontos por contrato, medida tick a tick pelo EA 1.1.0. Nulo = não medido (EA antigo, histórico importado).';
comment on column public.operacoes_publico.mae_pontos_por_contrato is
  'MAE: máxima excursão contra, em pontos por contrato (<= 0), medida tick a tick pelo EA 1.1.0. Nulo = não medido.';
comment on column public.operacoes_publico.excursao_parcial is
  'true = o EA subiu com a posição já aberta e o extremo pode ter passado sem ser visto.';

-- -----------------------------------------------------------------------------
-- 6. posicoes_abertas_publico: definição da 0020 inteira + MFE/MAE do ciclo em
--    curso de cada ticket, agregados no grupo (robô, símbolo, lado); colunas
--    novas no FIM. O join é LATERAL com limit 1 (ciclo mais alto = o que está
--    aberto): um join simples por (conta, posição) multiplicaria a linha do
--    ticket quando a posição já teve reversão (ciclo 1 fechado + ciclo 2
--    aberto) e estragaria preço médio, flutuante e n_abertas.
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
  count(*)::integer                                                         as n_abertas,
  max(x.mfe_pontos)                                                         as mfe_pontos_por_contrato,
  min(x.mae_pontos)                                                         as mae_pontos_por_contrato
from public.posicoes_abertas pa
join public.robos r on r.id = pa.robo_id and r.conta_principal_id = pa.conta_id
left join lateral (
  select e.mfe_pontos, e.mae_pontos
    from public.excursoes_posicao e
   where e.conta_id = pa.conta_id and e.posicao_id = pa.ticket
   order by e.ciclo desc
   limit 1
) x on true
where now() >= pa.aberta_em + make_interval(secs => r.atraso_publico_segundos)
group by pa.robo_id, r.slug, pa.simbolo, pa.lado;

grant select on public.posicoes_abertas_publico to anon, authenticated;

comment on column public.posicoes_abertas_publico.mfe_pontos_por_contrato is
  'Maior MFE (pontos por contrato) entre as entradas abertas do grupo, medido tick a tick pelo EA 1.1.0. Nulo = não medido.';
comment on column public.posicoes_abertas_publico.mae_pontos_por_contrato is
  'Menor MAE (pontos por contrato, <= 0) entre as entradas abertas do grupo. Nulo = não medido.';

-- -----------------------------------------------------------------------------
-- 7. exposicao_dia_publico: MEP/MEN do dia por robô. Só a conta principal e só
--    dias em que a conta pública do robô é a mesma do EA: sem importação
--    manual (mesma regra por dia da 0014, escrita em SQL como na 0017, e não
--    com dia_tem_importacao(), que é definer e não embute no planejador) e sem
--    operação do robô na conta principal fora de operacoes_publico
--    (hora_minima_operacao, duracao_minima_seg): o saldo que o EA mediu inclui
--    essa operação e não bateria com a curva pública do dia nem com o marcador
--    em n_saidas / n_operações. Robô com mais de um magic: max/min entre eles
--    e o horário e a contagem de saídas do magic que fez o extremo; n_magics
--    avisa o front. Sem conta, sem magic, sem volume.
-- -----------------------------------------------------------------------------
create view public.exposicao_dia_publico
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
    x.parcial
  from public.exposicao_dia x
  join public.robo_conta_magic m on m.conta_id = x.conta_id and m.magic = x.magic
  join public.robos r on r.id = m.robo_id and r.conta_principal_id = x.conta_id
  where not exists (
    select 1 from public.operacoes o
     where o.robo_id = r.id
       and o.dia_pregao = x.dia
       and (o.origem = 'manual'
            or (o.conta_id = x.conta_id
                and not exists (select 1 from public.operacoes_publico op where op.id = o.id)))
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
  count(*)::integer                                                           as n_magics
from por_magic
group by robo_id, slug, dia;

grant select on public.exposicao_dia_publico to anon, authenticated;

comment on view public.exposicao_dia_publico is
  'MEP/MEN do dia por robô medidos tick a tick pelo EA 1.1.0 (R$ BRUTOS por contrato; líquido = bruto - n_saidas × custo_por_contrato, com n_saidas = ciclos fechados). Existe linha só para dia que o EA mediu e em que nenhuma operação do robô ficou fora da conta pública (importação manual, hora/duração mínima); sem linha, o site calcula por fechamento (excursaoDoDia). Sem conta, magic ou volume.';
comment on column public.exposicao_dia_publico.mep_ea is 'Máxima exposição positiva do dia (>= 0), R$ brutos por contrato, tick a tick.';
comment on column public.exposicao_dia_publico.men_ea is 'Máxima exposição negativa do dia (<= 0), R$ brutos por contrato, tick a tick.';
comment on column public.exposicao_dia_publico.mep_ea_n_saidas is 'Ciclos (operações) do dia já fechados quando o MEP ocorreu (marcador na curva em mep_ea_n_saidas / n_operacoes).';
comment on column public.exposicao_dia_publico.excursao_ea_parcial is 'true = o EA subiu com o dia em andamento; o extremo pode ter passado sem ser visto.';
comment on column public.exposicao_dia_publico.n_magics is 'Quantos magics do robô mediram o dia. Com mais de um, mep_ea/men_ea são o máximo/mínimo entre eles, não a soma.';

-- -----------------------------------------------------------------------------
-- 8. Evento "coleta": definição da 0020 inteira + MEP/MEN de hoje da
--    exposicao_dia_publico (valor, horário e nº de saídas de cada extremo e
--    parcial; nulos quando o EA não mediu). Como o passo 0 do heartbeat roda
--    antes do coleta_status, o evento já sai com o valor novo. Throttle de
--    30 s por robô continua.
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
  v_mep       numeric;
  v_men       numeric;
  v_mep_em    timestamptz;
  v_men_em    timestamptz;
  v_mep_n     integer;
  v_men_n     integer;
  v_parcial   boolean;
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

      select x.mep_ea, x.men_ea, x.mep_ea_em, x.men_ea_em,
             x.mep_ea_n_saidas, x.men_ea_n_saidas, x.excursao_ea_parcial
        into v_mep, v_men, v_mep_em, v_men_em, v_mep_n, v_men_n, v_parcial
        from public.exposicao_dia_publico x
       where x.robo_id = r.id
         and x.dia = public.dia_pregao_de(now());

      v_payload := jsonb_build_object(
        'slug', r.slug,
        'ultimo_heartbeat_em', new.ultimo_heartbeat,
        'posicionado', (v_n_abertas > 0),
        'n_posicoes_abertas', v_n_abertas,
        'mep_ea', v_mep,
        'men_ea', v_men,
        'mep_ea_em', v_mep_em,
        'men_ea_em', v_men_em,
        'mep_ea_n_saidas', v_mep_n,
        'men_ea_n_saidas', v_men_n,
        'excursao_ea_parcial', v_parcial
      );
      perform realtime.send(v_payload, 'coleta', 'robo:' || r.slug, true);
      perform realtime.send(v_payload, 'coleta', 'casa', true);
    end if;
  end loop;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Excursão que chega DEPOIS da operação (reconciliação, reenvio da fila,
--    heartbeat que viu o último tick): reemite "operacao" com a linha inteira
--    da view, só para operação de HOJE (padrão da 0010: histórico não dispara
--    realtime). No caminho normal o ingest grava a excursão antes do upsert
--    de operacoes, então aqui não há operação ainda e nada é emitido; o
--    broadcast_operacao já sai com o join preenchido. Como o upsert só
--    escreve quando algo muda, o trigger não dispara em reenvio igual.
-- -----------------------------------------------------------------------------
create or replace function public.broadcast_excursao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_op_id   bigint;
  v_slug    text;
  v_payload jsonb;
begin
  select o.id, r.slug into v_op_id, v_slug
    from public.operacoes o
    join public.robos r on r.id = o.robo_id and r.conta_principal_id = o.conta_id
   where o.conta_id = new.conta_id
     and o.posicao_id = new.posicao_id
     and o.ciclo = new.ciclo
     and o.dia_pregao = public.dia_pregao_de(now())
   limit 1;

  if v_op_id is null then
    return null;  -- posição ainda aberta, histórico, conta secundária ou magic não atribuído
  end if;

  select to_jsonb(op) into v_payload
    from public.operacoes_publico op
   where op.id = v_op_id;

  if v_payload is not null then
    perform realtime.send(v_payload, 'operacao', 'robo:' || v_slug, true);
  end if;
  return null;
end;
$$;

create trigger excursoes_posicao_broadcast
  after insert or update on public.excursoes_posicao
  for each row execute function public.broadcast_excursao();

-- -----------------------------------------------------------------------------
-- 10. RLS e grants (padrão da 0009): anon nada nas tabelas; admin tudo;
--     service_role (ingest) ignora RLS.
-- -----------------------------------------------------------------------------
alter table public.excursoes_posicao enable row level security;
alter table public.exposicao_dia     enable row level security;

create policy "admin tudo" on public.excursoes_posicao for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.exposicao_dia     for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.excursoes_posicao to authenticated;
grant select, insert, update, delete on public.exposicao_dia     to authenticated;
grant all on public.excursoes_posicao to service_role;
grant all on public.exposicao_dia     to service_role;
