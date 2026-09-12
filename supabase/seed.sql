-- =============================================================================
-- Seed inicial. Idempotente (on conflict do nothing / update só do que é fixo).
-- Rodar com: npx supabase db push --include-seed   (ou colar no SQL editor)
-- =============================================================================

-- Valor do ponto e horário de pregão (spec §7). Margem de referência: pendência.
insert into public.multiplicadores (prefixo_simbolo, nome, valor_ponto_brl, margem_referencia, pregao_inicio, pregao_fim)
values
  ('WIN', 'Mini Índice', 0.20,  null, '09:00', '18:00'),
  ('WDO', 'Mini Dólar',  10.00, null, '09:00', '18:00')
on conflict (prefixo_simbolo) do nothing;

-- Feriados B3 2026. Confirmar com o calendário oficial da B3 antes do ano virar.
insert into public.feriados_b3 (dia, descricao)
values
  ('2026-01-01', 'Confraternização Universal'),
  ('2026-02-16', 'Carnaval'),
  ('2026-02-17', 'Carnaval'),
  ('2026-04-03', 'Paixão de Cristo'),
  ('2026-04-21', 'Tiradentes'),
  ('2026-05-01', 'Dia do Trabalho'),
  ('2026-06-04', 'Corpus Christi'),
  ('2026-09-07', 'Independência do Brasil'),
  ('2026-10-12', 'Nossa Senhora Aparecida'),
  ('2026-11-02', 'Finados'),
  ('2026-11-20', 'Consciência Negra'),
  ('2026-12-24', 'Véspera de Natal'),
  ('2026-12-25', 'Natal'),
  ('2026-12-31', 'Véspera de Ano Novo')
on conflict (dia) do nothing;

-- Parâmetros públicos editáveis sem deploy
insert into public.parametros (chave, valor, descricao, publico)
values
  ('fator_seguranca', '1.5'::jsonb,
   'Multiplica o drawdown máximo no cálculo do capital mínimo recomendado', true),
  ('links', jsonb_build_object(
     'whatsapp', '',
     'youtube', '',
     'youtube_canal_id', '',
     'instagram', '',
     'sala_ao_vivo', '',
     'btg_abertura_conta', '',
     'treinamentos', '',
     'painel_mercado', '',
     'programa_pontos', '',
     'proxima_live', ''
   ),
   'Links externos usados na home (comunidade, ecossistema, 3 passos)', true),
  ('textos', jsonb_build_object(
     'hero_titulo', 'Robôs de day trade com resultado ao vivo.',
     'hero_subtitulo', 'Cada operação chega direto do MetaTrader 5 das contas da Delta Robôs, normalizada por contrato. Sem print, sem edição.',
     'disclaimer', 'Resultados passados não garantem resultados futuros. Operações em mercado futuro envolvem risco de perda superior ao capital investido. Texto final pendente de aprovação do compliance.',
     'contato_email', ''
   ),
   'Textos públicos da home e das páginas dos robôs', true)
on conflict (chave) do nothing;

-- Robôs iniciais como "em breve" até as pendências da spec §13 serem preenchidas.
-- Depois: update public.robos set status = 'ativo', ativo = 'WIN', ... where slug = 'apollo';
insert into public.robos (slug, nome, ativo, descricao_publica, contratos_padrao, status, ordem)
values
  ('apollo', 'Apollo', 'WIN', 'Descrição pública a preencher.', 1, 'em_breve', 1),
  ('orion',  'Orion',  'WIN', 'Descrição pública a preencher.', 1, 'em_breve', 2)
on conflict (slug) do nothing;
