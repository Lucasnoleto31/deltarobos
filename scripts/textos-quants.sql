-- ============================================================================
-- Textos e link público da marca Quants Robôs (20/09/2026)
--
-- O QUE É: o site virou Quants Robôs, mas dois textos e um link moram no banco, na tabela
-- public.parametros — o subtítulo do hero e o aviso legal do rodapé (chave 'textos') e o link de
-- abertura de conta na corretora parceira (chave 'links'). Enquanto este script não roda, o site
-- corrige os textos na hora de mostrar (src/components/compartilhados/marca.ts) e usa o link direto
-- do código (src/components/home/ComoComecar.tsx), então o visitante já vê a versão certa; o banco é
-- que ainda guarda a versão antiga.
--
-- O QUE MUDA:
--   1. hero_subtitulo        -> a frase nova, aprovada pelo Artur em 20/09/2026;
--   2. disclaimer            -> o mesmo texto de hoje, com "Delta Robôs" virando "Quants Robôs" e
--                               "vinculado ao BTG Pactual" virando "vinculado a uma corretora
--                               parceira". Nenhuma outra palavra do aviso legal muda;
--   3. btg_abertura_conta    -> o link da Genial com o código do assessor (o nome da chave é de antes
--                               da troca de corretora e fica como está: renomear obriga a mexer no
--                               código que a lê).
-- hero_titulo e contato_email não são tocados.
--
-- RODAR É SEGURO: o operador `||` em jsonb junta as duas chaves ao objeto que já existe. As outras
-- chaves de 'textos' continuam como estão, e as outras linhas de parametros (links, fator_seguranca,
-- faixas) nem são lidas — o `where chave = 'textos'` cuida disso. Rodar duas vezes dá no mesmo.
--
-- COMO RODAR: SQL Editor do Supabase (projeto do site), colar e executar. O select do fim mostra
-- como os textos ficaram; o select do começo, como estavam.
--
-- DEPOIS DE RODAR: a correção do marca.ts para de encontrar o texto antigo e o banco volta a mandar
-- sozinho no que aparece na tela. Nada precisa ser publicado no site.
-- ============================================================================

-- antes
select
  valor -> 'hero_subtitulo' as hero_subtitulo_antes,
  valor -> 'disclaimer' as disclaimer_antes
from public.parametros
where chave = 'textos';

update public.parametros
set valor = valor || jsonb_build_object(
  'hero_subtitulo',
  'Acompanhe as operações diretamente das contas, com dados atualizados enquanto o mercado acontece.',
  'disclaimer',
  'Os resultados apresentados neste site são de contas operadas pela Quants Robôs, coletados automaticamente do MetaTrader 5 e exibidos por 1 contrato, líquidos dos custos indicados em cada robô. Rentabilidade passada não garante rentabilidade futura. Operações com contratos futuros, como mini índice e mini dólar, envolvem risco elevado e podem gerar perdas superiores ao capital investido, inclusive por alavancagem, falta de liquidez ou eventos de mercado. Os robôs são estratégias automatizadas de execução: a decisão de utilizá-los, a quantidade de contratos e a gestão de risco são de responsabilidade exclusiva do investidor, que deve avaliar sua situação financeira, seus objetivos e seu perfil antes de operar. As informações aqui divulgadas têm caráter informativo e não constituem recomendação, oferta ou solicitação de investimento. Custos, margens e condições variam conforme a corretora e alteram o resultado individual. A Quants Robôs atua por meio de escritório de assessoria de investimentos vinculado a uma corretora parceira; o assessor de investimentos não realiza gestão de recursos nem garante resultados. A regra de cálculo de cada número está na página Metodologia.'
)
where chave = 'textos';

-- link de abertura de conta na corretora parceira (Genial, com o código do assessor).
-- As outras chaves de 'links' (whatsapp, youtube, instagram, sala_ao_vivo...) continuam como estão.
update public.parametros
set valor = valor || jsonb_build_object(
  'btg_abertura_conta',
  'https://app.genialinvestimentos.com.br/abrir-conta?idAssessor=14253'
)
where chave = 'links';

-- depois: as quatro chaves continuam lá, com as duas novas em lugar das antigas
select
  valor -> 'hero_titulo' as hero_titulo,
  valor -> 'hero_subtitulo' as hero_subtitulo,
  valor -> 'disclaimer' as disclaimer,
  valor -> 'contato_email' as contato_email,
  atualizado_em
from public.parametros
where chave = 'textos';

select valor -> 'btg_abertura_conta' as abertura_de_conta
from public.parametros
where chave = 'links';
