# Delta Robôs: especificação do sistema

## 1. Contexto e objetivo

- Dono do projeto: Lucas, assessor de investimentos no BTG via escritório Delta. Os robôs de day trade da casa são os da Delta Robôs. Hoje são **Apollo** e **Orion**, e virão outros: o sistema precisa suportar qualquer quantidade de robôs.
- Objetivo: um site/app onde **qualquer pessoa, sem login, acessa pela URL e vê todas as estatísticas dos robôs**, com operações chegando **em tempo real do MetaTrader 5** das contas da matriz. Por trás, uma área do cliente (licenças) e um admin.
- Referência a superar: quantsrobos.com/performance?robo=apollo (página de performance por robô). O novo sistema precisa ser mais transparente, mais rápido e mais bonito no celular.
- Diferenciais: tempo real de verdade, normalização por contrato, carteira combinada de robôs, metodologia aberta.

## 2. Stack

- Next.js (App Router, TypeScript strict), Tailwind, shadcn/ui
- Supabase (projeto novo, separado de qualquer outro projeto): Postgres, Auth (email/senha, Google, Apple), Realtime, Edge Functions, Storage
- Gráficos: Recharts (KPIs, distribuições) e lightweight-charts (curva de capital)
- Deploy: Vercel. Domínio a definir.
- Mobile: PWA na v1; app nas lojas depois (Capacitor), sem reescrever nada.
- UI em pt-BR, timezone America/Sao_Paulo, moeda BRL, números com separador brasileiro.

## 3. Robôs

| Robô | Slug | Ativo | Horário | Contratos padrão | Magic number | Descrição pública |
|---|---|---|---|---|---|---|
| Apollo | apollo | preencher | preencher | preencher | preencher | preencher |
| Orion | orion | preencher | preencher | preencher | preencher | preencher |

- A tabela acima é só a lista inicial. Robôs são cadastrados no banco e gerenciados pelo admin. Adicionar um robô novo não pode exigir deploy nem mexer em código.
- **Nunca hardcodar nome, slug ou quantidade de robôs no código.** Tudo vem da tabela `robos`.
- Status do robô: `ativo`, `em_breve` (aparece na home como "em breve", sem estatísticas), `pausado` (aparece com aviso, mantém histórico) e `arquivado` (some da home, histórico continua acessível pela URL).
- Um robô pode ganhar versões ao longo do tempo (ex.: Apollo v2). Guardar `versao_robo` em cada operação pra permitir filtrar a curva por versão.
- Cada robô pode rodar em mais de uma conta da matriz. A identificação é sempre (conta, magic number).

## 4. Camadas e rotas

### Pública (sem login)
- `/` Visão geral (home): o resultado somado dos robôs e a lista que os compara
- `/robos/[slug]` página do robô, aba Resumo
- `/robos/[slug]/hoje` aba Ao vivo (25/11/2026): o dia de hoje do robô; só existe em robô com coletor (`robos_publico.tem_coletor`), nos outros a aba não aparece e o endereço responde 404
- `/robos/[slug]/calendario` aba Dia a dia, com a lista "Mês a mês" e os arquivos de cada mês (`#mes-a-mes`)
- `/robos/[slug]/risco` aba Quedas e risco
- `/robos/[slug]/faixas` aba Melhores horários
- `/robos/[slug]/operacoes` aba Operações: a lista completa
- `/robos/[slug]/ao-vivo` tela cheia do dia, aberta pela aba Ao vivo
- `/carteira` combinação de robôs (planejada para a Fase 4, ainda não existe; ver §8.5)
- `/simulador` Simular meu capital: capital x contratos x maior queda
- `/metodologia` Como funciona: de onde vêm os números, como começar e como cada indicador é calculado
- `/embed/[slug]` widget pra colar em outros sites
- Endereços que saíram em 25/11/2026 e redirecionam, sem ser permanente (`next.config.ts`): `/comparativo` para `/`, `/robos/[slug]/desempenho` para `/robos/[slug]` e `/robos/[slug]/relatorios` para `/robos/[slug]/calendario#mes-a-mes`
- `/api/relatorios/[slug]/[mes]/pdf` e `/api/relatorios/[slug]/[mes]/csv` relatório do mês em PDF e operações do mês em planilha (`mes` em YYYY-MM), os arquivos da lista "Mês a mês" e do pé da aba Operações
- `/api/og/casa` imagem OG da página inicial
- `/api/og/[slug]` imagem OG dinâmica com resultado do dia (pra link no WhatsApp)
- `/api/og/[slug]/[dia]` imagem do dia para compartilhar (PNG, `?formato=quadrado` 1080×1080, que é o padrão, ou `?formato=story` 1080×1920; hoje em cache de 60 s, dia passado 1 dia; 400 dia inválido ou futuro, 404 robô ou dia sem operação pública, 503 sem cache quando o banco falha)
- `/api/robos/[slug]/curva/[periodo]` curva por operação completa do período (JSON, só dados públicos, cache de 60 s), carregada sob demanda pela página do robô quando o visitante abre "Por operação"
- `/api/robos/[slug]/saldo/[dia]` série do saldo do dia medida pelo EA (JSON compacto `{dia, baldes: [[t, min, max, ultimo]], aproximado, bucketSeg, fechamentos: [[t, custo]], geradoEm}`, só dados públicos; hoje em cache de 15 s, dia passado 1 h; 400 dia inválido ou futuro, 404 robô, 503 sem cache quando o banco falha)

### Cliente (login)
- `/login`, `/cadastro`, `/esqueci-senha`
- `/app` minhas contas, licenças, qual robô está configurado em cada subconta, perfil

### Admin (role admin)
- `/admin/usuarios` adicionar, editar, excluir
- `/admin/robos` gestão dos robôs, magic numbers, custos, textos públicos
- `/admin/contas` contas da matriz e tokens do coletor
- `/admin/operacoes` importação manual (CSV) e correção
- `/admin/comunicados` avisos pra todos os cadastrados e pro site
- `/admin/coleta` status do coletor por conta (último heartbeat, versão do EA)

## 5. Coleta do MT5 em tempo real

### EA coletor: `mt5/DeltaReporter.mq5`
- Roda num gráfico próprio em cada terminal MT5 da matriz. **Não opera**, só lê. Assim o robô de trade nunca trava esperando HTTP.
- Inputs: URL base da API, token da conta, intervalo do heartbeat (padrão 3s), dias de histórico no init (padrão 7).
- `OnInit`: reenvia os últimos N dias de deals pra reconciliação (upsert por ticket).
- `OnTradeTransaction`: a cada deal adicionado, `POST /api/ingest/deal`.
- `OnTimer` (heartbeat): `POST /api/ingest/heartbeat` com balance, equity, posições abertas (ticket, símbolo, lado, volume, preço, lucro flutuante, magic) e último preço dos símbolos em uso.
- Header `Authorization: Bearer <token>`; corpo JSON; timeout curto; se falhar, guarda em fila e reenvia no próximo timer.
- Lembrete de configuração: no MT5, liberar a URL em Ferramentas > Opções > Expert Advisors > Permitir WebRequest.
- v1.1.0 (22/09/2026): mede tick a tick, só em memória, o MFE/MAE de cada posição e o MEP/MEN do dia por magic (seção 7); candles M1 opcionais em um terminal só
- v1.1.1 (23/09/2026): recebe as regras públicas por magic no `GET /api/ingest/ping` (campo `regras`, com `versao`) e aplica no MEP/MEN do dia, ecoando `regras_aplicadas`/`regras_versao` em `exposicao_dia`
- v1.1.2 (23/09/2026): série do saldo do dia em baldes de `InpSaldoBucketSeg` (5 s): `saldo_dia: [{magic, dia, regras_aplicadas, baldes: [[t, min, max, ultimo]]}]` no heartbeat, fila de até 720 baldes até o 2xx

### API de ingest (Next.js Route Handlers)
- `POST /api/ingest/deal`, `POST /api/ingest/heartbeat`, `POST /api/ingest/history`
- Valida o token (hash no banco), identifica a conta, grava. Idempotente (ticket único). Rate limit básico por conta.
- Deals viram **operações** pareando entrada e saída (por posição/ticket): abertura, fechamento, duração, contratos, pontos, resultado em R$, custos.
- Deal com magic não mapeado fica como "não atribuído", visível só no admin.
- Atualiza `coleta_status` a cada mensagem.

### Realtime no site
- Frontend assina, via Supabase Realtime, as views públicas de posições abertas e operações do dia. Nada de F5.
- Estatísticas pesadas (curva, drawdown, mensal) são recalculadas por job a cada 1 min em horário de pregão e servidas com cache. Só o painel "hoje" é realtime puro.
- Saúde: sem heartbeat por mais de 2 min em horário de pregão, o site mostra "sem atualização há X min" e status do robô vira "desconhecido". Nunca mostrar dado velho parecendo vivo. O contador de operações em aberto segue a mesma regra: sem heartbeat ele some ou vira "sem atualização", e fora do pregão não aparece.
- Config `atraso_publico_segundos` por robô (padrão 0) caso a casa queira exibir posição aberta com atraso.
- Broadcast disparado no banco, topics privados `robo:<slug>`: eventos `operacao`, `operacao_removida`, `posicao`, `posicao_fechada`, `coleta` e, desde a migration 0024, `saldo` (throttle 5 s, últimos 30 s de baldes de hoje, sem replay: buraco maior que isso relê a rota `/api/robos/[slug]/saldo/[dia]`). O topic `casa` leva o `resumo` da home.

## 6. Modelo de dados (Postgres)

### Tabelas privadas
- `robos`: id, slug, nome, ativo (WIN/WDO), descricao_publica, horario_inicio, horario_fim, contratos_padrao, custo_por_contrato, capital_referencia, atraso_publico_segundos, status (ativo | em_breve | pausado | arquivado), versao_atual, ordem
- `contas_matriz`: id, apelido, corretora, numero_conta (**nunca exposto**), token_hash, ativa
- `robo_conta_magic`: robo_id, conta_id, magic
- `deals`: ticket (PK), conta_id, robo_id, simbolo, tipo, entry, volume, preco, lucro, comissao, swap, executado_em, magic, raw (jsonb)
- `operacoes`: id, robo_id, conta_id, simbolo, lado, contratos, preco_entrada, preco_saida, abertura_em, fechamento_em, duracao_seg, pontos, pontos_por_contrato, resultado_brl, resultado_brl_por_contrato, custos_brl, versao_robo, origem (mt5 | manual)
- `posicoes_abertas`: conta_id, robo_id, ticket, simbolo, lado, volume, preco_abertura, lucro_flutuante, atualizado_em
- `snapshots_conta`: conta_id, balance, equity, em (guardar 1 por minuto, não 1 por heartbeat)
- `estatisticas_diarias`: robo_id, dia, pontos_por_contrato, resultado_brl_por_contrato, n_operacoes, n_gain, n_loss
- `estatisticas_cache`: robo_id, periodo, payload (jsonb), calculado_em
- `multiplicadores`: prefixo_simbolo (WIN, WDO), valor_ponto_brl, margem_referencia
- `feriados_b3`: dia, descricao
- `comunicados`: id, titulo, corpo, publico_bool, publicado_em
- `perfis`: user_id, nome, telefone, role (cliente | admin)
- `contas_cliente`: id, user_id, corretora, numero_conta, apelido
- `licencas`: id, user_id, robo_id, conta_cliente_id, chave, status, valida_ate
- `coleta_status`: conta_id, ultimo_heartbeat, ultimo_deal, versao_ea
- `alertas_inscricoes`: contato, canal (whatsapp | push | email), robo_id, tipo

### Views públicas (RLS: anon só SELECT nessas views)
- `robos_publico`: dados públicos do robô, `posicionado` e `n_posicoes_abertas` (quantas entradas ainda estão abertas na conta principal, cada ticket conta 1, só as que já passaram do atraso configurado). Sem volume, sem conta.
- `operacoes_publico`: robô, horários, lado, preços, pontos por contrato, R$ por contrato. Sem conta, sem volume real.
- `posicoes_abertas_publico`: robô, lado, preço de abertura, flutuante por contrato e `n_abertas` (quantas entradas do grupo ainda estão abertas, cada ticket conta 1). Sem volume, sem conta, respeitando o atraso configurado. Risco conhecido (21/09/2026, a decidir): como o preço de abertura do grupo é a média ponderada pelo volume e os preços de cada entrada ficam públicos em `operacoes_publico` quando fecham, com `n_abertas` dá para inferir a proporção entre os volumes das entradas de um grupo (nunca o tamanho: 2:1 pode ser 2 e 1 ou 20 e 10). Só vira informação se o robô escala posição com lotes diferentes. Alternativa, se não for aceito: publicar a média simples dos preços.
- `saldo_dia_publico`: robô, dia, início do balde, mín./máx./último do saldo do dia em R$ brutos por contrato, n_magics, atualizado_em. Sem conta, sem magic, sem volume.
- `estatisticas_publico`
- `comunicados_publico`

## 7. Regras de cálculo

- **Tudo normalizado por 1 contrato por entrada.** Contas da matriz com lotes diferentes não podem distorcer a média. Um robô pode ter várias entradas abertas ao mesmo tempo, e por isso a premissa escrita na tela é "com 1 contrato por entrada, já descontados os custos" (25/11/2026).
- Valor do ponto (configurável na tabela `multiplicadores`): WIN = R$ 0,20 por ponto por contrato; WDO = R$ 10,00 por ponto por contrato. O símbolo real muda de série todo vencimento (WINV26, WINZ26...), então mapear pelo prefixo.
- Custos: `custo_por_contrato` por robô (corretagem + emolumentos). O site mostra sempre o líquido; a opção bruto/líquido saiu das telas em 25/11/2026.
- Métricas: as da lista "Indicadores" da seção 8.0 (revisão de 25/11/2026), calculadas em `src/lib/stats` com teste. Saíram das telas: média mensal, drawdown em % sobre `capital_referencia`, payoff como razão, sequências de gains e de losses e histograma por operação.
- **Capital mínimo (regra de 25/11/2026).** Decisão do Lucas: "a margem exigida pela corretora é R$ 150,00 por contrato", vezes o máximo de entradas. Capital mínimo = margem por contrato × o máximo de entradas que o robô já teve abertas ao mesmo tempo + maior queda de todo o histórico × fator de segurança (parâmetro, padrão 1,5), publicado no real inteiro. Substitui a regra anterior (margem + drawdown máximo × fator), que tratava a conta como se tivesse 1 contrato só.
  - Margem: `multiplicadores.margem_referencia`, por ativo (R$ 150 no WIN). Sem margem cadastrada, o robô fica sem capital mínimo.
  - Entradas: o pico de operações abertas no mesmo instante (`picoDeEntradasAbertas`, `src/lib/stats/indicadores-robo.ts`), medido nas operações coletadas ao vivo; as importadas não têm hora de entrada e ficam fora. Sem medição vale 1.
  - Maior queda: a de todo o histórico, com 1 contrato por entrada e já com custos, seja qual for o período escolhido na tela.
  - A conta mora em `capitalMinimoRecomendado` (`src/lib/stats/kpis.ts`) e é lida por `capitalDoRobo` e `capitaisDaCasa` (`src/lib/consultas/capital.ts`). Toda tela que mostra capital mínimo ou entradas abertas usa essas duas: o número é o mesmo na lista da Visão geral, no Resumo, em Quedas e risco (com a conta por extenso), no simulador e no exemplo de Como funciona.
- Curva de capital acumulada por contrato, ponto a ponto por dia ou operação a operação (detalhe na seção 8.2), com a maior queda pintada de vermelho na própria linha (desde 25/11/2026 não há mais drawdown desenhado embaixo; o quanto o resultado ficou abaixo do topo em cada pregão é um gráfico próprio da aba Quedas e risco).
- Períodos (25/11/2026), por tela: Visão geral 12 meses, desde o início e 30 pregões; Resumo do robô desde o início, ano, mês e semana; Quedas e risco sem período (sempre o histórico inteiro); Melhores horários mês, ano e tudo; Operações por datas de e até; simulador 3 meses, 12 meses, ano e tudo.
- Calendário diário (verde/vermelho) e a lista "Mês a mês" (resultado, dias com ganho e maior queda de cada mês; soma, meses com ganho e maior queda de cada ano), que tomou o lugar do heatmap ano x mês em 25/11/2026.
- **MEP e MEN do dia, duas fontes (22/09/2026).**
  - **Medidos pelo EA 1.1.0, tick a tick** (migration 0021: tabela `exposicao_dia`, view `exposicao_dia_publico`, campos no evento `coleta`): a cada tick o EA soma o realizado do dia do magic com o flutuante das posições do magic, em R$ brutos por 1 contrato, e guarda o máximo (MEP) e o mínimo (MEN) com a hora (`mep_ea_em`/`men_ea_em`) e o nº de operações já fechadas (`mep_ea_n_saidas`/`men_ea_n_saidas`: ciclos fechados, não deals; uma saída em dois deals é uma operação e um custo só). É o número do Profit. O site mostra líquido = bruto − (operações fechadas até o extremo) × `custo_por_contrato`; pontos = ÷ valor do ponto; depois do custo, MEP não fica abaixo de 0 nem MEN acima (`mepMenDoDia` em `src/lib/stats/exposicao.ts`). Rótulo na interface: "medido no MT5, tick a tick", mais "parcial" quando `excursao_ea_parcial` (o EA subiu com o dia em andamento, ou reiniciou no meio dele, e pode ter perdido um extremo; a marca é grudenta no banco: `parcial OR`, um reinício nunca a apaga). Marcadores na curva por operação em `n_saidas / n_operações`. Dia com importação manual, ou em que alguma operação do robô ficou fora da conta pública (hora mínima, duração mínima), não usa a fonte do EA (a view já exclui: o saldo medido inclui essa operação e não bateria com a curva do dia). Vale no detalhe do dia (aba Dia a dia) e na aba Ao vivo, que era o "Hoje ao vivo" (valor inicial da view, atualizado pelo evento `coleta`; some quando não há medição).
  - **Por fechamento, a reserva** nos dias sem medição (antes do EA 1.1.0, histórico importado, conta com o EA antigo): MEP = o maior valor positivo que o saldo líquido acumulado do dia atingiu, por 1 contrato, a cada fechamento de operação (sem o resultado não realizado); MEN = o menor valor negativo do mesmo acumulado. Se o acumulado nunca ficou positivo, MEP = 0 e não há operação do MEP; idem para o MEN. Em empate vale a primeira operação em que o extremo ocorreu. É sempre igual ou menor (em módulo) que o do Profit, e a interface diz "por fechamento", sem fingir que é o número do Profit.
- **MFE e MAE por operação (EA 1.1.0, 22/09/2026).** Máxima excursão favorável (≥ 0) e adversa (≤ 0) em PONTOS por 1 contrato, tick a tick enquanto a posição viveu: `(px − preço de abertura) × sinal do lado`, com `px` = last do tick, senão bid na compra e ask na venda; em virada de mão fecha um ciclo e abre outro. Tabela `excursoes_posicao` (migration 0021), em `operacoes_publico` como `mfe_pontos_por_contrato`, `mae_pontos_por_contrato`, `mfe_em`, `mae_em` e `excursao_parcial` (o EA subiu com a posição já aberta); nulos em operação não medida. Na tupla compacta (`OperacaoCompacta`) são as posições 9 e 10, opcionais (ausente ou null = não medido); no pacote `ops-codec` vão esparsas (só as operações medidas, com índices em deltas), para as ~15 mil não medidas não custarem nada. A aba Operações mostra só o MAE, na coluna "Pior momento" (25/11/2026: o melhor momento saiu da tabela; a coluna só aparece quando a página tem operação medida, e a tabela rola de lado com o Resultado preso), e a planilha do mês traz as duas no fim, com os nomes `melhor_momento_pontos_por_contrato` e `pior_momento_pontos_por_contrato` desde 25/11/2026 (eram `mfe_…` e `mae_…`; a ordem das colunas não mudou). Glossário: MFE/MAE. Nas curvas por operação viram um traço vertical (dente) de acumulado antes + MAE até acumulado antes + MFE (23/09/2026, `dentesPorOperacao` em `src/lib/stats/saldo-dia.ts`, conversão pelo valor do ponto e pelos contratos escolhidos; em série agrupada, o envelope da fatia: menor MAE e maior MFE; a dica mostra "MFE / MAE"). Glossário: dentesExcursao.
- **Série do saldo do dia (EA 1.1.2, 23/09/2026).** A curva real do dia, o "calor" que o robô passou com a posição aberta. A cada `InpSaldoBucketSeg` (5 s) o EA fecha um balde por magic com o mínimo, o máximo e o último valor do saldo do dia (realizado + flutuante, o mesmo do MEP/MEN, já com as regras públicas aplicadas), em R$ brutos por 1 contrato, e manda os baldes fechados no heartbeat (`saldo_dia`; tabela privada `saldo_intradiario`, migration 0024, upsert least/greatest/último). O público lê `saldo_dia_publico` (só conta principal, só balde medido com regras, só dia sem importação manual) pela rota `/api/robos/[slug]/saldo/[dia]` e, no dia corrente, pelo evento `saldo`. Líquido no instante t = bruto(t) − soma dos custos das operações públicas fechadas ANTES do fim do balde (t < início + bucketSeg: o balde é meio-aberto; `liquidarSerie` em `src/lib/stats/saldo-dia.ts`, a mesma ideia de `mepMenDoDia`); pontos = ÷ valor do ponto. `n_magics > 1` ⇒ min = max = soma dos "último" dos magics: aproximação, a faixa mín./máx. não é desenhada e a legenda diz "aproximado". Dia sem série (EA anterior à 1.1.2, robô sem coletor, dia importado) desenha a curva por fechamento de sempre, rotulada "por fechamento". No site (aba Ao vivo, tela cheia, aba Dia a dia) a curva é limpa, no estilo do Profit (Artur, 24/09/2026): a linha pelo último valor de grupos de baldes (`PONTOS_LEVE`), sem a faixa mín./máx., sem as bolinhas de fechamento e sem os marcadores de MEP/MEN no desenho (os números seguem escritos em "Melhor momento do dia" e "Pior momento do dia", ao lado do número da aba Ao vivo, e no detalhe do dia da aba Dia a dia); o eixo vai do primeiro ao último dado do dia com dez minutos de folga (`janelaDosDados`), cresce com o pregão, e os rótulos vêm a cada 15, 30 ou 60 min conforme cabe (`rotulosDeTempo`). A imagem do dia (§8.8) mantém a faixa e o eixo no horário do robô. MEP/MEN da série = pico (maior máximo, ≥ 0) e vale (menor mínimo, ≤ 0) dos baldes já líquidos, que batem com `exposicao_dia` em bruto; em líquido podem diferir em um custo por contrato quando a saída cai no mesmo balde do extremo (a série paga o custo no balde da saída, o EA desconta só as saídas anteriores ao extremo). Coletor que subiu com o dia em andamento: a linha nasce no primeiro balde, sem rampa desde a abertura, com "medido a partir de HH:MM" (quando há saída antes do primeiro balde, ou quando ele vem mais de um minuto depois do início do eixo e o EA marcou o dia como parcial, `excursao_ea_parcial`; sem essa marca o atraso é só o EA esperando a primeira posição, com o saldo em zero, e nada é dito, 24/09/2026), e as saídas anteriores já entram no realizado. Na aba Ao vivo, buraco na série (evento `saldo` com salto maior que 60 s, coletor que voltou depois de mais de 2 min calado) e primeira carga que falhou fora do pregão relêem a rota até 3 vezes cada, a no máximo uma por minuto; robô sem coletor não pede a rota. Nas curvas por operação, os dentes de MFE/MAE do item acima. Glossário: curvaDoDia, faixaSaldo.
- Carteira: soma das séries diárias dos robôs escolhidos com pesos em contratos, drawdown conjunto e correlação dos retornos diários.
- Dia de pregão em Brasília; sábado, domingo e `feriados_b3` não contam.
- **Regras por robô que tiram operações da conta pública** (`robos.hora_minima_operacao`; `robos.duracao_minima_seg` com `duracao_minima_desde`): operação aberta antes da hora mínima, ou operação do MT5 mais curta que a duração mínima em pregão igual ou posterior a `desde`, fica fora do site e das estatísticas, mas continua no banco (importação manual não tem duração e ignora a duração mínima). Nada é apagado, a ressincronização do MT5 não recria nada e voltar atrás é um update. A Metodologia explica as duas regras.

## 8. Páginas

### 8.0 O que mudou em 25/11/2026 (ficha Mesa e revisão das telas)

A pedido do Lucas ("a estrutura da página está ok, mas a página não está legal; coisas que não são necessárias pode tirar"), as telas foram enxugadas e ganharam a casca de sistema (barra lateral com os robôs, fita de mercado). No mesmo dia veio a revisão do que cada tela mostra ("quais páginas e abas são necessárias? informações que não são importantes vamos tirar, coloque indicadores que fazem sentido para o trader quando o assunto é robô"). Onde os itens abaixo e as subseções seguintes divergirem, vale este resumo; o desenho, a pergunta de cada tela e a tabela completa dos indicadores estão no `DESIGN.md` (seção 9).

**Páginas e abas**

- **Site**: Visão geral (`/`), Simular meu capital (`/simulador`) e Como funciona (`/metodologia`).
- **Página do robô**, seis abas: Resumo, Ao vivo (só em robô com coletor), Dia a dia, Quedas e risco, Melhores horários e Operações. A Tela ao vivo em tela cheia continua e abre pela aba Ao vivo.
- **Saíram**: Comparar robôs (a comparação é a lista da Visão geral), a aba Desempenho (o que servia foi para o Resumo) e a aba Relatórios (os arquivos de cada mês estão em Dia a dia). Os endereços antigos redirecionam, sem ser permanente, em `next.config.ts`: `/comparativo` para `/`, `/robos/[slug]/desempenho` para `/robos/[slug]` e `/robos/[slug]/relatorios` para `/robos/[slug]/calendario#mes-a-mes`.
- **Decisões do Lucas que ficam**: a aba Melhores horários continua; o histórico continua descrito como hoje, sem separar importado de ao vivo; o Alaska & Square continua na lista e na soma.

**Indicadores**

- **Entraram**: ganho para cada R$ 1 da maior queda (resultado ÷ maior queda do mesmo período; é o que ordena a lista de robôs); entradas abertas ao mesmo tempo; capital mínimo pela regra nova (seção 7); abaixo do topo hoje; meses com ganho e pior mês; um dia ruim típico (a perda que 1 em cada 20 pregões alcançou ou passou; exige 40 pregões); acertos para empatar (perda típica ÷ (ganho típico + perda típica)); resultado médio por operação, ao lado do custo considerado; pregões em que operou; e, no simulador, o aviso de robôs que andam juntos (mesmo sentido em 75% ou mais dos pregões em comum, com pelo menos 30).
- **Ficam**: resultado no período, com a premissa e o tamanho do histórico; maior queda e se já recuperou; a queda por dentro (tempo caindo, tempo até recuperar, dias abaixo do topo, outras quedas); dias com ganho e pior dia; maior sequência de dias com perda; acertos; ganho típico, perda típica e maior perda numa operação; fator de lucro; operações por dia e duração típica; resultado por mês; melhor e pior momento do dia; resultado de hoje e operação aberta; cabe, apertado ou não cabe.
- **Saíram**: Calmar, índice de úlcera, risco de ruína, variação de um dia para o outro, tempo médio para recuperar, média por mês, retorno sobre o capital, capital de referência e a queda em % dele, ganho médio contra perda média como razão, melhor dia como indicador, sequências de operações, os filtros de pontos, as opções "antes dos custos" e contratos, resultado por dia da semana fora da aba de horários, "melhor momento" como coluna de Operações, e "contratos por operação", "versão" e "última operação" no cabeçalho do robô.
- **Regras**: número de ganho nunca aparece sem a maior queda ao lado; acertos nunca aparecem sem o necessário para empatar; percentual de retorno e média por mês ou por dia não entram em tela nenhuma; indicador de histórico curto (menos de 12 meses) diz o tamanho do histórico; o que o sistema não sabe (preço da licença, resultado de clientes, motivo de o robô não ter operado num dia) não é inventado.
- **Onde mora**: as contas em `src/lib/stats` (os indicadores novos em `indicadores-robo.ts`), o capital em `src/lib/consultas/capital.ts`, e o nome e o texto de cada indicador em `src/components/compartilhados/glossario.ts`.

**Telas**

- **Casca**: barra lateral fixa em toda página (áreas: Visão geral, Simular meu capital, Como funciona; e a lista de robôs com o que cada um fez hoje, ao vivo) e fita de mercado no topo (pregão, cotação de cada ativo, o dia da casa em uma frase). O rodapé é uma linha de links para fora do site e o aviso legal.
- **Celular**: versão própria abaixo de 1024 px. A navegação é uma barra presa embaixo (Visão geral, Robôs, Simular, Mais); "Robôs" e "Mais" abrem uma folha que sobe de baixo. A marca e a fita rolam com a página. Na página inicial, a curva de um robô se escolhe por um seletor em texto, e o botão "Como começar" vem no fim da lista.
- **Home (8.1)**: ficou com três coisas: o resultado somado dos robôs em número grande (com a premissa "1 contrato por entrada em cada robô, já descontados os custos"), a curva do período com a maior queda marcada em vermelho, e a lista dos robôs (passar o ponteiro num robô troca o número e a curva pelos dele; clicar abre a página do robô). A lista é a comparação entre os robôs: vem em ordem de ganho para cada R$ 1 da maior queda, com o capital mínimo e o tamanho do histórico de cada um. Período padrão: 12 meses; também "desde o início" e "30 pregões". Saíram da home: hero, cards, resumo do dia, comunidade, ecossistema, como começar e FAQ. "Como começar" e as perguntas moram em Como funciona; os canais, no rodapé e no botão "Como começar" da barra lateral.
- **Estado do robô**: no lugar dos selos (operando, posicionado, histórico), uma frase: "hoje +R$ 240 em 3 operações", "hoje ainda sem operação", "em operação agora", "sem operação hoje", "sem acompanhamento ao vivo · dados até dd/mm", "sem atualização no momento". O site não afirma que o robô está ligado.
- **Página do robô (8.2)**: cabeçalho com o botão "Quero esse robô" e as seis abas da lista acima (Dia a dia era Calendário/Diário, Quedas e risco era Risco, Melhores horários era Faixas). O Resumo responde "este robô vale a pena?": resultado desde o início com a maior queda ao lado, as barras por mês e o bloco "Como ele opera".
- **Operações (8.3)**: uma tabela só em qualquer largura, sem Símbolo, Bruto, Custos e Melhor momento; no celular rola de lado com o Resultado preso.
- **Simulador (8.6)**: sem capital digitado, simula com o capital mínimo publicado para a escolha (e diz isso na premissa). O capital mínimo é o da regra da seção 7, com as entradas abertas. O texto fixo de compliance aparece uma vez, debaixo do título. O semáforo é uma frase em texto, não um selo, e a tela avisa quando dois robôs escolhidos andam juntos.
- **Como funciona (8.7, era Metodologia)**: responde "de onde vêm os números e como eu começo?". Abre com "Como começar" (três passos e o link de abertura de conta), explica os indicadores na ordem em que o trader decide (resultado, maior queda, ganho para cada R$ 1 da maior queda, capital mínimo, entradas abertas ao mesmo tempo, acertos e o necessário para empatar, resultado médio por operação e o custo, meses com ganho e pior mês, um dia ruim típico), mostra a conta do capital mínimo de um robô com os números lidos do banco, diz o que pode ser diferente na conta de quem usa (o preço em que a ordem sai, os custos da corretora, o imposto de renda e a licença não estão no número; sem preço de licença nem alíquota) e termina nas perguntas frequentes. Não explica o que saiu do site.
- **Vocabulário**: maior queda (drawdown), acertos (taxa de acerto), ganho típico e perda típica, garantia (a margem), melhor e pior momento (MEP/MEN, MFE/MAE), "com 1 contrato por entrada, já descontados os custos" (por contrato, líquido). A tabela completa está na seção 7 do `DESIGN.md`.

### 8.1 Visão geral `/` (revisão de 25/11/2026)
Uma tela só, que responde "os robôs dão resultado, e qual deles?". De cima para baixo:

1. Linha de título: "Resultado somado dos robôs" (ou o nome do robô apontado na lista) e, alinhados à borda da curva, os seletores "Somados · Lado a lado" (só com dois robôs ou mais com histórico) e período "12 meses · Desde o início · 30 pregões" (padrão 12 meses). O período é um corte de data só, para a soma e para cada robô; "30 pregões" são os últimos 30 pregões em que algum robô operou. Assim as linhas da lista somam o número grande.
2. Número grande: o resultado somado no período, com a premissa ("com 1 contrato por entrada em cada um dos N robôs, já descontados os custos") e de quando é ("nos últimos 12 meses", "desde" e a data do primeiro pregão por extenso, "nos últimos 30 pregões"; o robô apontado cujo histórico cabe inteiro no período diz o tamanho dele: "em 9 meses, 172 pregões"). Ao lado, dias com ganho, pior dia e maior queda.
3. Curva do período, com a maior queda em vermelho. Em "Lado a lado", a curva de cada robô no mesmo eixo de tempo, cada uma num tom do texto com o nome na ponta, todas partindo de zero no começo do período (o robô que estreou dentro dele começa onde o histórico começa). Passar o ponteiro troca o número pelo acumulado até aquele pregão.
4. Lista "Por robô", que é a comparação: resultado no período, maior queda do mesmo período, ganho para cada R$ 1 da maior queda e capital mínimo (de `capitaisDaCasa`, com a maior queda de todo o histórico; a tela diz isso embaixo da lista). Ordem: do maior ganho por queda para o menor; quem não tem o número leva um traço com o motivo ("sem ganho no período", "sem queda no período", "sem pregões no período") e vai para o fim; o "em breve" por último. Debaixo do nome, o que o robô fez hoje, ao vivo, e o tamanho do histórico ("histórico de 9 meses, 172 pregões"). Passar o ponteiro ou o foco num robô troca o número, os fatos e a curva pelos dele; clicar abre a página do robô.
5. No celular (DESIGN.md, seção 3): um seletor só acima da curva ("Somados · Lado a lado · cada robô"), os fatos depois da curva, a lista compacta e, no fim, o botão "Como começar".

Saíram da home em 25/11/2026: hero, cards dos robôs, resumo do dia, comunidade, ecossistema, como começar, FAQ e a coluna do mês na lista. A barra ao vivo virou a fita de mercado da casca, em toda página (pregão, cotação de cada ativo e o dia da casa em uma frase, sem zeros). "Como começar" e as perguntas moram em Como funciona; os canais, no rodapé e na barra lateral. Ranking, carteira sugerida, robôs vs CDI e IBOV, agenda do trader, comunicados e alertas, previstos aqui para as fases seguintes, não estão no site.

### 8.2 Página do robô `/robos/[slug]` (revisão de 25/11/2026)
- **Cabeçalho** (em todas as abas): caminho de volta ("Visão geral / ativo"), nome, o que o robô fez hoje em uma frase (ao vivo), descrição pública, o link "Simular com meu capital" e o botão "Quero esse robô"; numa linha de texto, o horário, "No ar desde", o capital mínimo e quantas entradas ele já teve abertas ao mesmo tempo (os dois de `capitalDoRobo`), e "Conta demo" quando for o caso. Saíram contratos por operação, versão e "última operação há X min".
- **Seis abas**: Resumo (`/robos/[slug]`), Ao vivo (`/hoje`, só em robô com coletor), Dia a dia (`/calendario`), Quedas e risco (`/risco`), Melhores horários (`/faixas`) e Operações (`/operacoes`). Saíram Desempenho e Relatórios (os endereços redirecionam, §4).
- **Resumo**: "este robô vale a pena?". Número grande com o resultado desde o início, a premissa e o tamanho do histórico; período "Desde o início · Ano · Mês · Semana" (abre em desde o início; "Hoje" é a aba Ao vivo). Ao lado: maior queda e se já recuperou (ou quanto está abaixo do topo), ganho para cada R$ 1 da maior queda, capital mínimo, meses com ganho com o pior mês e dias com ganho com o pior dia. Depois a curva, "Por dia" ou "Por operação", com a maior queda em vermelho (semana e mês abrem por operação); o resultado de cada mês em barras, do histórico inteiro; e "Como ele opera" (acertos com o necessário para empatar, fator de lucro em frase, ganho típico, perda típica, maior perda numa operação, resultado médio por operação com o custo considerado, operações por dia, duração típica, pregões em que operou e entradas abertas ao mesmo tempo), ao lado de "De onde vêm os números" (origem dos dados, custo descontado, quanto vale 1 ponto, relatórios mensais, relatório do MetaTrader). Saíram os KPIs em cards, média mensal, payoff como razão, melhor dia como indicador, as opções pontos/R$, bruto/líquido e de contratos, "Últimas operações" e "Mais números".
- **Curva por operação**: um ponto a cada operação fechada, até 20 mil operações no período; acima disso agrupa operações vizinhas. O Resumo chega com a série leve de 240 pontos, que pinta na hora, e a série completa vem sob demanda pela rota `/api/robos/[slug]/curva/[periodo]` (cache de 60 s) quando o visitante abre "Por operação"; o Dia a dia, que já tem as operações no navegador, desenha na resolução fiel direto. A maior queda por operação pode ser maior que a por dia, porque passa pelo saldo no meio do pregão.
- **Ao vivo** (`/robos/[slug]/hoje`): "o que ele está fazendo agora?". Número grande com o resultado de hoje e a premissa; ao lado, o melhor e o pior momento do dia (medidos pelo EA tick a tick quando há medição, senão por fechamento; regra na seção 7) e a operação aberta, com o resultado dela até aqui e quantas entradas estão abertas (nunca contratos). A curva real do dia (série do EA, linha limpa, eixo pelos dados; por fechamento quando não há série), as operações de hoje entrando na hora, o botão "Compartilhar o dia" (§8.8) quando há operação e o link "Abrir em tela cheia" (§8.4). Enquanto hoje não tem operação, posição nem curva, mostra o último pregão com operação, com a data escrita, e diz em palavras o que há de hoje. Robô sem coletor não tem a aba, e o endereço responde 404.
- **Dia a dia** (`/robos/[slug]/calendario`, era Calendário/Diário): "como foi cada dia e cada mês?". Número grande com o resultado do mês em vista; ao lado, dias com ganho, pior dia, maior queda no mês e, quando houve pregão sem operação, em quantos pregões operou. O mês em casas, com "não operou" no pregão em que a bolsa abriu e o robô não fechou operação (só em robô ativo com coletor; o motivo o site não sabe e não diz), e o dia escolhido ao lado: MEP e MEN, a série do EA do dia (carregada sob demanda pela rota de saldo, senão por fechamento) e o botão Compartilhar com a imagem do dia. Depois a lista "Mês a mês" (`#mes-a-mes`: resultado, dias com ganho, maior queda, PDF e planilha de cada mês; de cada ano, a soma, os meses com ganho e a maior queda; com muitos anos, os mais antigos vêm recolhidos), que tomou o lugar do heatmap ano x mês e da aba Relatórios, e os melhores e os piores dias, com o tamanho do histórico quando é curto. Robô sem custo cadastrado diz "antes dos custos" na premissa.
- **Quedas e risco** (`/robos/[slug]/risco`, era Risco): "quanto posso perder e quanto capital preciso?". Sem seletor de período: sempre o histórico inteiro, para a maior queda do alto bater com a da conta do capital. Número grande com a maior queda; ao lado, tempo caindo, tempo até recuperar, abaixo do topo hoje e dias abaixo do topo; a curva com a queda em vermelho e o gráfico de quanto o resultado ficou abaixo do topo em cada pregão. "Quanto capital é preciso": a conta do capital mínimo por extenso (garantia por contrato × entradas abertas ao mesmo tempo, mais a maior queda × fator), quanto a maior queda levaria desse capital e, quando o mínimo não basta para isso, quanto seria preciso para ela ficar no limite de apertado do simulador, com o link "Simular meu capital"; ao lado, "Na sua conta pode ser diferente", sem valores. Depois "Outras quedas" em tabela e "Mais números": um dia ruim típico, pior dia, pior mês, maior sequência de dias com perda, pior momento dentro de um dia (quando há medição), ganho para cada R$ 1 da maior queda e resultado médio por operação com o custo. Saíram drawdown em %, capital de referência, Calmar, índice de úlcera, risco de ruína, variação de um dia para o outro e tempo médio para recuperar.
- **Melhores horários** (`/robos/[slug]/faixas`, era Faixas): o melhor dia e horário em palavras ("Quinta às 9h") no lugar do número grande, com a classe e os fatos (operações e a parte delas que terminou com ganho, resultado, maior queda, tamanho sugerido da posição); o mapa de dia da semana por hora de entrada, que é o controle dos fatos; a tabela de todos os dias e horários, com filtro por classe; e como a classificação é feita, com os limites do banco em palavras. Período "Mês · Ano · Tudo". Decisão do Lucas: a aba fica.
- **Operações**: §8.3.

### 8.3 Operações `/robos/[slug]/operacoes` (revisão de 25/11/2026)
Tabela completa paginada (50 por página), filtros na URL por datas de e até, lado e resultado, a planilha do filtro para baixar e, na primeira página sem filtro, as operações de hoje entrando ao vivo. A linha de título diz quantas operações há no filtro, quanto somam, a maior queda do mesmo período e a pior operação, com a premissa; a soma some quando o filtro é só das que ganharam ou só das que perderam, e com filtro de compra ou venda a linha mostra só a contagem. Uma tabela só em qualquer largura (no celular rola de lado com o Resultado preso), sem Símbolo, Bruto e Custos (continuam na planilha) e sem Melhor momento; a coluna "Pior momento" (MAE em pontos por contrato) aparece quando a página tem operação medida. Robô de histórico importado não mostra as colunas que não tem como preencher (preços, duração, pior momento). No pé, a paginação e os arquivos dos meses mais recentes (PDF e planilha), com o caminho para a lista inteira em Dia a dia.

### 8.4 Tela cheia `/robos/[slug]/ao-vivo` (revisão de 25/11/2026)
Tela cheia só com o dia, sem a barra lateral e a fita do site, sempre no tema escuro. Quem leva até ela é o link "Abrir em tela cheia" da aba Ao vivo, e o caminho de volta, na faixa de cima, leva à aba Ao vivo (ao Resumo, no robô sem coletor). Resultado do dia grande com a premissa ("com 1 contrato por entrada, já descontados os custos"), a operação aberta em uma frase e, quando há mais de uma, quantas entradas estão abertas (mesmo número da página do robô, nunca contratos); ao lado, quantas operações e o melhor e o pior momento do dia; a mesma curva da aba Ao vivo (série do EA quando há, senão por fechamento) e as operações de hoje. Saíram os pontos e a contagem de operações com ganho (acertos não aparecem sem o necessário para empatar). Feita para compartilhar e deixar aberta num monitor ou no celular. Com operação no dia, o botão Compartilhar da faixa de cima abre a imagem do dia (§8.8), em Quadrado ou Story, com Compartilhar, Baixar imagem e Copiar link (o link da própria tela cheia); sem operação, ele compartilha o link da tela (24/09/2026).

### 8.5 Carteira `/carteira`
Seleciona robôs e contratos de cada um, vê curva combinada, drawdown conjunto, correlação e KPIs da carteira.

Em 25/11/2026 a página não existe (o endereço responde 404) e está na Fase 4 (§11). Hoje a combinação de robôs com contratos de cada um é feita no simulador (§8.6), que soma as séries, mede a maior queda da soma e avisa quando dois robôs escolhidos andam juntos.

### 8.6 Simulador `/simulador` (aprovado em 23/09/2026)
Aritmética sobre o histórico público, por contrato, aplicada ao capital e aos contratos que o visitante informa. **Não é recomendação nem projeção de resultado**, e a página diz isso em texto fixo, sob o título e junto do semáforo.

- **Entradas:** capital em R$ (inteiro, maior que zero), contratos por robô (padrão 1; 0 tira o robô da simulação; máximo 1.000) e período (3 meses, 12 meses, ano, tudo; padrão tudo). Só entram robôs com status diferente de `arquivado` e com série diária não vazia; a lista vem de `robos`, nunca do código. Tudo fica na URL, para compartilhar e para os links pré-preenchidos: `/simulador?capital=30000&r=apollo:2,orion:1&periodo=12m` (`r` ausente = todos os robôs com 1; `r=` vazio = nenhum; slug desconhecido é ignorado; `capital` ausente = desde 25/11/2026 a página simula com o capital mínimo publicado para a escolha e diz isso (antes pedia o capital e não simulava nada); valores padrão são omitidos da URL; `capital` e `n` aceitam só dígitos: `30.000`, `2.5`, `1e5` e `0x10` não valem).
- **Cálculo:** para cada dia de pregão, resultado da carteira = soma, sobre os robôs escolhidos, de contratos × resultado líquido por 1 contrato do robô no dia (dia em que o robô não operou conta zero), sobre as séries diárias públicas. Patrimônio simulado = capital informado + resultado acumulado, dia a dia. O drawdown é medido nessa curva como na curva de capital; **em % é sempre sobre o capital inicial informado**, nunca sobre o patrimônio do momento, e a tela diz "sobre o capital inicial informado". Dia de pregão da carteira é o dia em que algum robô escolhido operou: dia sem operação de nenhum não entra na contagem nem interrompe a sequência negativa; dia em que a soma dá zero interrompe.
- **Saídas:** resultado do período em R$ (o resultado em % do capital e o patrimônio final saíram da tela em 25/11/2026: percentual de retorno não entra em tela nenhuma); drawdown máximo em R$ e em % do capital inicial (com início, fundo e recuperação; o % fica porque mede risco); pior mês (menor soma mensal dentro do período; os meses das pontas podem estar incompletos, e a tela diz quantos pregões entraram); pior dia; maior sequência de dias negativos (dia zerado interrompe) e dias negativos sobre os pregões do período; capital mínimo da carteira = soma, por robô, de contratos × capital mínimo do robô pela regra da seção 7 (desde 25/11/2026: margem de referência × o máximo de entradas abertas ao mesmo tempo + drawdown máximo de **todo** o histórico do robô com 1 contrato por entrada × fator de segurança, o mesmo número da aba Quedas e risco, arredondado ao real inteiro publicado); quando algum robô escolhido não tem margem de referência configurada, a soma dos mínimos conhecidos aparece como piso ("≥ R$ X") e a tela diz quais robôs ficaram sem mínimo; curva de patrimônio simulado (zero = capital inicial) no mesmo desenho da curva de capital, com a maior queda em vermelho na própria linha (desde 25/11/2026 não há drawdown embaixo).
- **Semáforo:** **não cabe** quando capital < capital mínimo (sem o total, quando capital < soma dos mínimos conhecidos) ou quando drawdown máximo simulado ≥ capital (o patrimônio simulado teria zerado); **apertado** quando cabe e drawdown máximo simulado > 25% do capital inicial; **cabe** no resto (25% exato = cabe; as comparações são a centavos). Sem nenhum mínimo conhecido, só a regra do drawdown decide. A tela avisa quais robôs ficaram sem mínimo.
- **Compliance (inegociável):** texto fixo "Aritmética sobre o histórico; não é recomendação nem projeção de resultado."; capital mínimo só como a regra já publicada na aba Quedas e risco; nada de "robô ideal", de projeção futura nem de retorno anualizado; aviso legal (`parametros.textos.disclaimer`) pelo rodapé, como nas outras páginas (não se repete no painel: decisão de 17/09/2026), e "conta demo" escrito ao lado do robô que vem de conta demo (em texto, sem selo, desde 25/11/2026); sem emoji.
- **Links (25/11/2026):** "Simular com meu capital" no cabeçalho do robô (em todas as abas; "Simular" no celular) e "Simular meu capital" na conta do capital da aba Quedas e risco, já com o robô preenchido (`/simulador?r=<slug>:1`); "Simular meu capital" na barra lateral e "Simular" na barra de baixo do celular. Como funciona tem a seção "Simular meu capital" (`#simulador`).

### 8.7 Como funciona `/metodologia` (era Metodologia)
Como começar, como a coleta funciona, o que é "com 1 contrato por entrada, já descontados os custos", a definição de cada indicador que está nas telas (na ordem da seção 8.0), a conta do capital mínimo com os números de um robô lidos do banco, o que pode ser diferente na conta de quem usa, o simulador, os melhores horários, as palavras do mercado e as perguntas frequentes. Indicador que sai das telas sai daqui. Os ids das seções são endereços usados por outras telas (`#como-comecar`, `#coleta`, `#custos`, `#normalizacao`, `#drawdown`, `#simulador`, `#faixas`).

### 8.8 Embed `/embed/[slug]`, OG `/api/og/[slug]` e imagem do dia `/api/og/[slug]/[dia]`
Widget leve (card do robô) pra iframe. Imagem OG com resultado do dia, gerada na hora.

**Imagem do dia para compartilhar (24/09/2026).** Pedido do Lucas: uma imagem pronta ao fim de cada pregão, gerada pelo site, com a curva real do dia, o resultado, o MEP, o MEN e o número de operações.

- **Para que serve.** PNG pronto para a live, o WhatsApp e o Instagram, sem montagem manual.
- **Formatos.** `quadrado`, o padrão (1080×1080: feed e WhatsApp), e `story` (1080×1920: stories e status, com 200 px livres em cima e 260 px embaixo para a interface do Instagram não cobrir nada, e os selos abaixo da data). Qualquer outro parâmetro, como o `v=` que o site acrescenta para a prévia de hoje não vir velha, é ignorado.
- **Conteúdo, nesta ordem:**
  1. marca (símbolo e "Quants Robôs");
  2. nome do robô e ativo ("Mini Índice · WIN") e a data por extenso ("quarta-feira, 23 de setembro de 2026");
  3. selos "Parcial · até HH:MM" e "Conta demo" (este quando `conta_tipo = 'demo'`);
  4. resultado líquido do dia por 1 contrato em R$, grande e colorido, com os pontos;
  5. operações, acerto (com o número de gains), MEP e MEN, com a nota da fonte;
  6. a curva do dia;
  7. rodapé "Por 1 contrato, líquido de custos · `<domínio>/robos/<slug>`" (o domínio de `NEXT_PUBLIC_SITE_URL`, sem protocolo nem "www.") e uma frase legal curta.
- **Curva.** A mesma do Hoje ao vivo, da tela cheia e do calendário.
  - Com a série do EA 1.1.2: linha do saldo líquido, faixa mín./máx. (sem faixa quando aproximado) e linha do zero, só com os baldes que vão de dez minutos antes do início do horário do robô até dez minutos depois do mais tarde entre o fim do horário e a última saída, reduzida a 300 pontos. Na imagem parcial o corte vai até dez minutos depois do mais tarde entre o fim do dia (o fim do horário do robô ou o do pregão do ativo, o que vier depois) e a última saída: entre o fim do horário do robô e a zeragem a linha acompanha a posição aberta, em vez de parar no último corte (24/09/2026). Coletor que ligou com o dia em andamento: a linha nasce no primeiro balde, e a legenda diz "desde HH:MM".
  - O traço é verde acima do zero, vermelho abaixo e neutro em cima do zero (saldo parado antes da primeira entrada, a origem da curva por fechamento); a área e a faixa trocam de cor no zero.
  - Sem série: a curva por fechamento (acumulado líquido operação a operação), rotulada "por fechamento".
  - Dia só de importação manual: o eixo é a ordem das operações ("1ª", "31ª"…), rotulado "histórico importado, sem horário".
  - No máximo 5 marcas no eixo de baixo. Na curva por fechamento cada marca fica em cima do ponto da operação que ela nomeia (a j-ésima em j/n, a última na borda direita); o site ainda usa a regra antiga, uma operação à esquerda (24/09/2026, a alinhar).
- **MEP e MEN.** Os medidos pelo EA, líquidos como no Hoje ao vivo (`mepMenDoDia`), com a nota "medidos no MT5". Sem medição, por fechamento (`excursao`), com a nota "por fechamento de operação".
- **Parcial.** O dia é hoje e ainda não passou o mais tarde entre o fim do horário do robô e o do pregão do ativo (em 23/09/2026 o Apollo, com horário até 17:30, fechou uma operação às 18:00), ou o robô ainda está posicionado (`robos_publico.posicionado`): às 18:00:00 a zeragem ainda não virou operação, e sem isso a imagem saía definitiva com o resultado de antes dela (24/09/2026). A hora do selo é a do último dado (último balde ou última saída). Depois disso, a imagem é definitiva e sai sem selo.
- **Frase legal.** A frase "passado não garante futuro" do aviso legal (`parametros.textos.disclaimer`, com a troca de marca), quando cabe em até 100 caracteres; senão "Rentabilidade passada não garante rentabilidade futura.". Vai no mesmo tamanho do rodapé: é o único aviso de risco da peça. O aviso inteiro (mais de 1.100 caracteres) não cabe numa imagem e continua no rodapé do site.
- **Dados.** Só dados públicos, das views `*_publico`: nada de conta, magic, volume ou contratos. Sem emoji, sem projeção, sem recomendação.
- **Respostas.** 400, 404 e 503 como na §4. Cache: dia passado `public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800`; hoje `public, max-age=0, s-maxage=60, stale-while-revalidate=60`. Todo dado é lido antes de desenhar, para uma falha do banco não sair como imagem com status 200.
- **Botão.** "Compartilhar o dia" no Hoje ao vivo, na tela cheia e no detalhe do dia do calendário, só quando o dia tem operação. Abre a prévia com a escolha Quadrado · Story e as ações:
  - Compartilhar: envia o arquivo pelo compartilhamento do celular, com a legenda "O dia do <robô> em <data>, por 1 contrato, líquido de custos." e o link ("Conta demo." antes do link quando `conta_tipo = 'demo'`: a legenda pode ser encaminhada sem a imagem); some quando o navegador não aceita arquivos. Cancelar não é erro.
  - Baixar imagem: `quants-<slug>-<dia>-<formato>.png`.
  - Copiar link: a página do robô; na tela cheia, a própria tela cheia.

  O diálogo baixa a imagem uma vez, ao abrir ou ao trocar de formato, e usa o mesmo arquivo na prévia, no download e no compartilhamento: assim o compartilhamento é chamado no próprio clique, como o Safari exige. No Hoje ao vivo e na tela cheia o `v=` é o nº de operações e o minuto do último dado; o balde só conta até dez minutos depois do mais tarde entre o fim do dia do robô e a última saída, porque o coletor manda baldes até a meia-noite e a imagem não muda mais (24/09/2026).

## 9. Design

Desde 25/11/2026 o desenho do site público segue a ficha "Mesa", descrita em `DESIGN.md` na raiz do repositório. Ela manda no que for visual; esta seção fica só com o que é requisito. A página inicial (§8.1) ficou reduzida, a pedido do Lucas, a três coisas: o resultado somado em número grande, a curva com a maior queda marcada e a lista dos robôs; "como começar" e as perguntas moram em Como funciona, e os canais, no rodapé.

- É um sistema, não uma landing page: barra lateral fixa com os robôs ao vivo, fita de mercado no topo e área de trabalho na largura toda da tela, sem caixas (o conteúdo fica direto sobre o fundo, separado por espaço e fio).
- Cada tela tem uma coisa principal: um número grande que responde à pergunta da tela, com a premissa escrita junto, e um gráfico. O jargão (drawdown, payoff, taxa de acerto) aparece com nome de leigo e explicação no glossário.
- Tema escuro padrão com tema claro. Verde só para ganho, vermelho só para perda e para a maior queda, cinza para neutro. Hanken Grotesk com números tabulares.
- Sem caixa, pílula, vidro, gradiente, sombra, caixa alta nem ícone decorativo (seção 8 do `DESIGN.md`).
- Skeletons em tudo que carrega, indicador "atualizado há Xs" em tudo que é ao vivo.
- A página do robô e o fechamento do dia precisam ficar bons em print de celular, pois vão parar em story e WhatsApp. O fechamento pronto é a imagem do dia (§8.8).

## 10. Segurança

- RLS em todas as tabelas. Anon só lê as views públicas. Cliente só lê o que é dele. Admin via role em `perfis`.
- Número de conta da matriz nunca sai do banco pra view pública ou pro frontend.
- Ingest só com token por conta (hash no banco), HTTPS, rate limit, log de rejeições.
- Secrets só em `.env.local` e nas variáveis do Vercel/Supabase. Nunca no repositório, nunca no chat.

## 11. Fases de entrega

- **Fase 1 (MVP ao vivo):** migrations do schema, API de ingest, EA `DeltaReporter.mq5`, home com barra, hero, cards, comunidade e 3 passos, página do robô com KPIs básicos, curva e operações do dia ao vivo.
- **Fase 2 (estatísticas completas):** todas as métricas, calendário, heatmap, distribuições, risco, página de operações, ao vivo, metodologia, OG image, embed.
- **Fase 3 (cliente e admin):** Auth (email/senha, Google, Apple), cadastro, esqueci a senha, área do cliente com contas e licenças, admin completo, importação manual.
- **Fase 4 (extras):** carteira, simulador, ranking, CDI/IBOV, agenda, alertas, comunicados públicos, PWA e app.

## 12. Critérios de aceite da Fase 1

- Deal fechado no MT5 aparece na página pública em até 5 segundos sem refresh.
- Página pública abre sem login e não expõe conta, volume real nem token.
- Resultado do dia e KPIs batem com o relatório do MT5 num dia de teste.
- Se o coletor parar, o site avisa em até 2 minutos.
- Home e página do robô com boa performance no Lighthouse mobile.
- Cadastrar um robô novo pelo admin faz ele aparecer na home e ganhar a própria URL sem deploy.

## 13. Pendências (Lucas preenche antes ou responde quando o Claude Code perguntar)

- Ativo, horário, contratos padrão e magic number de Apollo e Orion
- Descrição pública de cada robô (o que pode ser dito da estratégia)
- Custo por contrato considerado
- Capital de referência pra drawdown em %
- Cores e logo da Delta Robôs
- Links: WhatsApp, YouTube, Instagram, Sala ao Vivo, link de abertura de conta no BTG
- Texto do disclaimer aprovado pelo compliance
