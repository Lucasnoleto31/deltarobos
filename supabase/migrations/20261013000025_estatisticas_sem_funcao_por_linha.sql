-- =============================================================================
-- 0025 · recalcular_estatisticas_dia sem função por linha
--   O gatilho operacoes_estatisticas roda por linha e recalcula o dia inteiro do
--   robô a cada operação gravada. O filtro do dia chamava operacao_e_publica()
--   (security definer, com subconsultas) uma vez para cada operação do dia: no
--   05/10/2026 do Apollo, com ~2.400 operações, 147 ms por recálculo. Uma página
--   de histórico do EA (até 500 deals, ~250 operações) passava de 30 s e batia no
--   statement_timeout de 8 s do PostgREST: a página voltava 500, o EA a reenviava
--   para sempre e o resto da fila ficava parado (buraco de 05/10 a 13/10/2026).
--
--   Mesmo desenho da 0017 (views sem função por linha): a regra de
--   operacao_e_publica escrita em SQL direto, com robos lido uma vez e a
--   checagem de importação manual do dia feita uma vez. Resultado idêntico ao da
--   função (conferido em 13/10/2026: 124 dias-robô desde 01/08, contagem,
--   resultado e pontos iguais, e iguais ao que estava gravado), 3,5 ms no mesmo
--   dia. operacao_e_publica continua existindo e valendo para quem a chama.
--
--   Se a regra pública mudar, mudar aqui também (e na view operacoes_publico).
-- =============================================================================

create or replace function public.recalcular_estatisticas_dia(p_robo_id uuid, p_dia date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_robo_id is null or p_dia is null then
    return;
  end if;

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
      left join public.robos r on r.id = p_robo_id
      cross join lateral (
        select exists (
          select 1 from public.operacoes m
           where m.robo_id = p_robo_id and m.dia_pregao = p_dia and m.origem = 'manual'
        ) as imp
      ) di
     where op.robo_id = p_robo_id
       and op.dia_pregao = p_dia
       -- origem: manual sempre; MT5 só da conta principal e só em dia sem importação
       and (case
              when op.origem = 'manual' then true
              else (op.conta_id is not null
                    and op.conta_id = r.conta_principal_id
                    and not di.imp)
            end)
       -- hora mínima (todas as origens) e duração mínima (só MT5), como o not exists da função
       and not coalesce((
             (r.hora_minima_operacao is not null
              and op.abertura_em is not null
              and (op.abertura_em at time zone 'America/Sao_Paulo')::time < r.hora_minima_operacao)
             or
             (op.origem <> 'manual'
              and r.duracao_minima_seg is not null
              and coalesce(op.duracao_seg, 0) < r.duracao_minima_seg
              and (r.duracao_minima_desde is null or p_dia >= r.duracao_minima_desde))
           ), false)
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
