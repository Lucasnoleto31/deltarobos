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
- `/` home
- `/robos/[slug]` página do robô
- `/robos/[slug]/operacoes` lista completa
- `/robos/[slug]/ao-vivo` tela cheia do dia
- `/carteira` combinação de robôs
- `/simulador` capital x contratos x drawdown
- `/metodologia` como cada métrica é calculada
- `/embed/[slug]` widget pra colar em outros sites
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

- **Tudo normalizado por 1 contrato.** Contas da matriz com lotes diferentes não podem distorcer a média.
- Valor do ponto (configurável na tabela `multiplicadores`): WIN = R$ 0,20 por ponto por contrato; WDO = R$ 10,00 por ponto por contrato. O símbolo real muda de série todo vencimento (WINV26, WINZ26...), então mapear pelo prefixo.
- Custos: `custo_por_contrato` por robô (corretagem + emolumentos). Exibir líquido por padrão, com toggle bruto/líquido.
- Métricas: resultado do dia, mês, ano, acumulado, média mensal; drawdown máximo em R$ por contrato e em % sobre `capital_referencia`; tempo de recuperação do drawdown; taxa de acerto; fator de lucro; payoff; nº de operações; média de operações por dia; melhor e pior dia; dias positivos x negativos; maior sequência de gains e de losses; resultado por dia da semana e por hora; histograma por operação; capital mínimo recomendado = margem por contrato + drawdown máximo x fator de segurança (configurável, padrão 1,5).
- Curva de capital acumulada por contrato, ponto a ponto por dia ou operação a operação (detalhe na seção 8.2), com drawdown desenhado embaixo.
- Períodos: 7d, 30d, 3m, 12m, ano atual, tudo, personalizado.
- Calendário diário (verde/vermelho) e heatmap ano x mês.
- **MEP e MEN do dia, duas fontes (22/09/2026).**
  - **Medidos pelo EA 1.1.0, tick a tick** (migration 0021: tabela `exposicao_dia`, view `exposicao_dia_publico`, campos no evento `coleta`): a cada tick o EA soma o realizado do dia do magic com o flutuante das posições do magic, em R$ brutos por 1 contrato, e guarda o máximo (MEP) e o mínimo (MEN) com a hora (`mep_ea_em`/`men_ea_em`) e o nº de operações já fechadas (`mep_ea_n_saidas`/`men_ea_n_saidas`: ciclos fechados, não deals; uma saída em dois deals é uma operação e um custo só). É o número do Profit. O site mostra líquido = bruto − (operações fechadas até o extremo) × `custo_por_contrato`; pontos = ÷ valor do ponto; depois do custo, MEP não fica abaixo de 0 nem MEN acima (`mepMenDoDia` em `src/lib/stats/exposicao.ts`). Rótulo na interface: "medido no MT5, tick a tick", mais "parcial" quando `excursao_ea_parcial` (o EA subiu com o dia em andamento, ou reiniciou no meio dele, e pode ter perdido um extremo; a marca é grudenta no banco: `parcial OR`, um reinício nunca a apaga). Marcadores na curva por operação em `n_saidas / n_operações`. Dia com importação manual, ou em que alguma operação do robô ficou fora da conta pública (hora mínima, duração mínima), não usa a fonte do EA (a view já exclui: o saldo medido inclui essa operação e não bateria com a curva do dia). Vale no detalhe do dia (Calendário) e no "Hoje ao vivo" (valor inicial da view, atualizado pelo evento `coleta`; some quando não há medição).
  - **Por fechamento, a reserva** nos dias sem medição (antes do EA 1.1.0, histórico importado, conta com o EA antigo): MEP = o maior valor positivo que o saldo líquido acumulado do dia atingiu, por 1 contrato, a cada fechamento de operação (sem o resultado não realizado); MEN = o menor valor negativo do mesmo acumulado. Se o acumulado nunca ficou positivo, MEP = 0 e não há operação do MEP; idem para o MEN. Em empate vale a primeira operação em que o extremo ocorreu. É sempre igual ou menor (em módulo) que o do Profit, e a interface diz "por fechamento", sem fingir que é o número do Profit.
- **MFE e MAE por operação (EA 1.1.0, 22/09/2026).** Máxima excursão favorável (≥ 0) e adversa (≤ 0) em PONTOS por 1 contrato, tick a tick enquanto a posição viveu: `(px − preço de abertura) × sinal do lado`, com `px` = last do tick, senão bid na compra e ask na venda; em virada de mão fecha um ciclo e abre outro. Tabela `excursoes_posicao` (migration 0021), em `operacoes_publico` como `mfe_pontos_por_contrato`, `mae_pontos_por_contrato`, `mfe_em`, `mae_em` e `excursao_parcial` (o EA subiu com a posição já aberta); nulos em operação não medida. Na tupla compacta (`OperacaoCompacta`) são as posições 9 e 10, opcionais (ausente ou null = não medido); no pacote `ops-codec` vão esparsas (só as operações medidas, com índices em deltas), para as ~15 mil não medidas não custarem nada. A lista de operações mostra a coluna "MFE / MAE" (só a partir de xl: em lg as doze colunas já ocupam os ~963–994 px do `.conteudo` e a 13ª rolaria a tabela de lado; na lista do celular, uma linha a mais só na operação medida) e o CSV as duas colunas no fim. Glossário: MFE/MAE. Nas curvas por operação viram um traço vertical (dente) de acumulado antes + MAE até acumulado antes + MFE (23/09/2026, `dentesPorOperacao` em `src/lib/stats/saldo-dia.ts`, conversão pelo valor do ponto e pelos contratos escolhidos; em série agrupada, o envelope da fatia: menor MAE e maior MFE; a dica mostra "MFE / MAE"). Glossário: dentesExcursao.
- **Série do saldo do dia (EA 1.1.2, 23/09/2026).** A curva real do dia, o "calor" que o robô passou com a posição aberta. A cada `InpSaldoBucketSeg` (5 s) o EA fecha um balde por magic com o mínimo, o máximo e o último valor do saldo do dia (realizado + flutuante, o mesmo do MEP/MEN, já com as regras públicas aplicadas), em R$ brutos por 1 contrato, e manda os baldes fechados no heartbeat (`saldo_dia`; tabela privada `saldo_intradiario`, migration 0024, upsert least/greatest/último). O público lê `saldo_dia_publico` (só conta principal, só balde medido com regras, só dia sem importação manual) pela rota `/api/robos/[slug]/saldo/[dia]` e, no dia corrente, pelo evento `saldo`. Líquido no instante t = bruto(t) − soma dos custos das operações públicas fechadas ANTES do fim do balde (t < início + bucketSeg: o balde é meio-aberto; `liquidarSerie` em `src/lib/stats/saldo-dia.ts`, a mesma ideia de `mepMenDoDia`); pontos = ÷ valor do ponto. `n_magics > 1` ⇒ min = max = soma dos "último" dos magics: aproximação, a faixa mín./máx. não é desenhada e a legenda diz "aproximado". Dia sem série (EA anterior à 1.1.2, robô sem coletor, dia importado) desenha a curva por fechamento de sempre, rotulada "por fechamento". O eixo do tempo vai do horário do robô (`horario_inicio`/`horario_fim`, senão o pregão do ativo), esticado para conter todo balde e todo fechamento, com rótulos nas horas cheias de Brasília. MEP/MEN da série = pico (maior máximo, ≥ 0) e vale (menor mínimo, ≤ 0) dos baldes já líquidos, que batem com `exposicao_dia` em bruto; em líquido podem diferir em um custo por contrato quando a saída cai no mesmo balde do extremo (a série paga o custo no balde da saída, o EA desconta só as saídas anteriores ao extremo). Coletor que subiu com o dia em andamento: a linha nasce no primeiro balde, sem rampa desde a abertura, com "medido a partir de HH:MM" (quando há saída antes do primeiro balde, ou quando ele vem mais de um minuto depois do início do eixo e o EA marcou o dia como parcial, `excursao_ea_parcial`; sem essa marca o atraso é só o EA esperando a primeira posição, com o saldo em zero, e nada é dito, 24/09/2026), e as saídas anteriores já entram no realizado. No "Hoje ao vivo", buraco na série (evento `saldo` com salto maior que 60 s, coletor que voltou depois de mais de 2 min calado) e primeira carga que falhou fora do pregão relêem a rota até 3 vezes cada, a no máximo uma por minuto; robô sem coletor não pede a rota. Nas curvas por operação, os dentes de MFE/MAE do item acima. Glossário: curvaDoDia, faixaSaldo.
- Carteira: soma das séries diárias dos robôs escolhidos com pesos em contratos, drawdown conjunto e correlação dos retornos diários.
- Dia de pregão em Brasília; sábado, domingo e `feriados_b3` não contam.
- **Regras por robô que tiram operações da conta pública** (`robos.hora_minima_operacao`; `robos.duracao_minima_seg` com `duracao_minima_desde`): operação aberta antes da hora mínima, ou operação do MT5 mais curta que a duração mínima em pregão igual ou posterior a `desde`, fica fora do site e das estatísticas, mas continua no banco (importação manual não tem duração e ignora a duração mínima). Nada é apagado, a ressincronização do MT5 não recria nada e voltar atrás é um update. A Metodologia explica as duas regras.

## 8. Páginas

### 8.1 Home `/` (ordem de cima pra baixo)
1. Barra ao vivo: pregão aberto ou fechado, WIN e WDO agora, quantos robôs estão posicionados e quantas operações em aberto a casa tem (número de entradas ainda abertas na conta principal de cada robô, nunca contratos), resultado do dia da casa, "atualizado há Xs"
2. Hero: frase curta, número grande com o resultado do dia somado por contrato, botões "ver os robôs" e "entrar na comunidade"
3. Cards dos robôs (quantos existirem, hoje Apollo e Orion): nome, ativo, status (operando, posicionado, parado, fora do horário, em breve), operações em aberto (número de entradas ainda abertas, nunca contratos; 1 = "1 operação em aberto"), dia, mês, acumulado, drawdown, mini curva de 30 dias. Grid responsivo que fica bom com 2 ou com 12 robôs, ordenado pelo mês. Com mais de 6 robôs, filtro por ativo (WIN, WDO) e busca.
4. Resumo do dia: operações feitas, acerto do dia, melhor robô do dia. Após o fechamento vira "fechamento de hoje" (layout pensado pra print)
5. Ranking: robô do mês, robô do ano, maior sequência positiva
6. Carteira Delta: combinação sugerida com curva combinada e drawdown conjunto, link pra montar a própria
7. Robôs vs CDI e IBOV no ano
8. Comunidade: card do WhatsApp com botão direto, YouTube com os 3 últimos vídeos e próxima live (automático pelo RSS do canal), Instagram, Sala ao Vivo
9. Ecossistema Delta: cards pra treinamentos, painel de mercado e programa de pontos por lotes (links externos por enquanto)
10. Agenda do trader: calendário econômico do dia (Copom, IPCA, payroll, FOMC), feriados da B3, próximas lives
11. Comunicados e changelog dos robôs
12. Alertas: cadastro pra receber no WhatsApp ou push quando um robô abrir ou fechar operação, e resumo diário
13. Como começar em 3 passos: abre conta no BTG pelo link do assessor, escolhe o robô, libera a licença
14. Transparência e FAQ: metodologia, relatórios do MT5, perguntas comuns, disclaimer
15. Rodapé: app, contato, redes, aviso legal

No celular, os itens 1, 2, 3 e 8 ficam acima da dobra. Na v1 entram 1, 2, 3, 8, 13 e 15. O resto entra nas fases seguintes.

### 8.2 Página do robô `/robos/[slug]`
- Cabeçalho: nome, ativo, descrição pública, horário, contratos padrão, "conta real desde", status ao vivo, "última operação há X min"
- Hoje ao vivo: resultado do dia em pontos e R$, posição aberta (lado, preço, flutuante), operações em aberto (número de entradas ainda abertas na conta principal, nunca contratos), operações do dia entrando na hora; MEP e MEN do dia medidos pelo EA tick a tick (linha "Exposição do dia", que some quando não há medição; regra na seção 7); curva real do dia pela série do EA (faixa mín./máx., fechamentos marcados, MEP/MEN da série), por fechamento com dentes de MFE/MAE quando não há série; com posição aberta e nenhuma saída a série já aparece; botão "Compartilhar o dia" (a imagem do dia, §8.8) quando há operação
- KPIs (cards): acumulado, mês, média mensal, drawdown máximo, taxa de acerto, fator de lucro, payoff, nº de operações, melhor e pior dia, dias positivos x negativos, maior sequência de perdas
- Curva de capital com drawdown, filtros de período, toggle pontos/R$, toggle bruto/líquido, seletor de contratos ("com 5 contratos seria..."), abas "Por dia" e "Por operação". "Por operação" liga um ponto a cada operação fechada, uma operação por ponto até 20 mil operações no período; acima disso agrupa operações vizinhas. Na Visão geral a página chega com a série leve de 240 pontos, que pinta na hora, e a série completa é carregada sob demanda pela rota `/api/robos/[slug]/curva/[periodo]` (cache de 60 s) quando o visitante abre "Por operação"; a aba Desempenho e o calendário, que já têm as operações no navegador, desenham na resolução fiel direto. O drawdown por operação pode ser maior que o por dia, porque passa pelo saldo no meio do pregão.
- Mensal: heatmap ano x mês
- Diário: calendário do mês; o detalhe do dia mostra MEP e MEN (regra na seção 7) e desenha a série do EA do dia, carregada sob demanda pela rota de saldo, senão por fechamento; com operação, o botão Compartilhar do detalhe gera a imagem do dia selecionado (§8.8)
- Distribuição: dia da semana, hora do dia, histograma por operação
- Risco: drawdown em R$ e %, tempo de recuperação, capital mínimo recomendado por contrato (sempre com o drawdown máximo de todo o histórico, fixo ao trocar o período; link "Simular com meu capital")
- Últimas 50 operações com link pra lista completa
- Transparência: como o dado é coletado, custos considerados, link pro relatório mensal do MT5
- Disclaimer e CTA "quero esse robô"

### 8.3 Operações `/robos/[slug]/operacoes`
Tabela completa paginada, filtros por período, lado e resultado, export CSV, realtime nas do dia. Coluna "MFE / MAE" (pontos por contrato, "–" na operação não medida) só a partir de xl; no CSV, as duas colunas no fim.

### 8.4 Ao vivo `/robos/[slug]/ao-vivo`
Tela cheia só com o dia: resultado grande, posição aberta, operações em aberto (mesmo número da home e da página do robô: entradas ainda abertas, nunca contratos), a mesma curva do Hoje ao vivo (série do EA quando há, senão por fechamento), últimas operações. Feita pra compartilhar e deixar aberta no celular. Com operação no dia, o botão Compartilhar do rodapé abre a imagem do dia (§8.8), em Quadrado ou Story, com Compartilhar, Baixar imagem e Copiar link (o link da própria tela cheia); sem operação, ele compartilha o link da tela, como antes (24/09/2026).

### 8.5 Carteira `/carteira`
Seleciona robôs e contratos de cada um, vê curva combinada, drawdown conjunto, correlação e KPIs da carteira.

### 8.6 Simulador `/simulador` (aprovado em 23/09/2026)
Aritmética sobre o histórico público, por contrato, aplicada ao capital e aos contratos que o visitante informa. **Não é recomendação nem projeção de resultado**, e a página diz isso em texto fixo, sob o título e junto do semáforo.

- **Entradas:** capital em R$ (inteiro, maior que zero), contratos por robô (padrão 1; 0 tira o robô da simulação; máximo 1.000) e período (3 meses, 12 meses, ano, tudo; padrão tudo). Só entram robôs com status diferente de `arquivado` e com série diária não vazia; a lista vem de `robos`, nunca do código. Tudo fica na URL, para compartilhar e para os links pré-preenchidos: `/simulador?capital=30000&r=apollo:2,orion:1&periodo=12m` (`r` ausente = todos os robôs com 1; `r=` vazio = nenhum; slug desconhecido é ignorado; `capital` ausente = a página pede o capital e não simula nada; valores padrão são omitidos da URL; `capital` e `n` aceitam só dígitos: `30.000`, `2.5`, `1e5` e `0x10` não valem).
- **Cálculo:** para cada dia de pregão, resultado da carteira = soma, sobre os robôs escolhidos, de contratos × resultado líquido por 1 contrato do robô no dia (dia em que o robô não operou conta zero), sobre as séries diárias públicas. Patrimônio simulado = capital informado + resultado acumulado, dia a dia. O drawdown é medido nessa curva como na curva de capital; **em % é sempre sobre o capital inicial informado**, nunca sobre o patrimônio do momento, e a tela diz "sobre o capital inicial informado". Dia de pregão da carteira é o dia em que algum robô escolhido operou: dia sem operação de nenhum não entra na contagem nem interrompe a sequência negativa; dia em que a soma dá zero interrompe.
- **Saídas:** resultado do período em R$ e em % do capital inicial; drawdown máximo em R$ e em % do capital inicial (com início, fundo e recuperação); pior mês (menor soma mensal dentro do período; os meses das pontas podem estar incompletos, e a tela diz quantos pregões entraram); pior dia; maior sequência de dias negativos (dia zerado interrompe) e dias negativos sobre os pregões do período; patrimônio final; capital mínimo da carteira = soma, por robô, de contratos × capital mínimo por contrato pela regra da seção 7 (margem de referência + drawdown máximo de **todo** o histórico do robô com 1 contrato × fator de segurança, o mesmo número da aba Risco, arredondado ao real inteiro publicado); quando algum robô escolhido não tem margem de referência configurada, a soma dos mínimos conhecidos aparece como piso ("≥ R$ X") e a tela diz quais robôs ficaram sem mínimo; curva de patrimônio simulado (zero = capital inicial) com o drawdown embaixo, no mesmo desenho da curva de capital.
- **Semáforo:** **não cabe** quando capital < capital mínimo (sem o total, quando capital < soma dos mínimos conhecidos) ou quando drawdown máximo simulado ≥ capital (o patrimônio simulado teria zerado); **apertado** quando cabe e drawdown máximo simulado > 25% do capital inicial; **cabe** no resto (25% exato = cabe; as comparações são a centavos). Sem nenhum mínimo conhecido, só a regra do drawdown decide. A tela avisa quais robôs ficaram sem mínimo.
- **Compliance (inegociável):** texto fixo "Aritmética sobre o histórico; não é recomendação nem projeção de resultado."; capital mínimo só como a regra já publicada na aba Risco; nada de "robô ideal", de projeção futura nem de retorno anualizado; aviso legal (`parametros.textos.disclaimer`) pelo rodapé, como nas outras páginas (não se repete no painel: decisão de 17/09/2026), e selo "Conta demo" por robô; sem emoji.
- **Links:** "Simular com meu capital" na aba Risco (célula do capital mínimo) e no card do robô na home, já com o robô preenchido (`/simulador?r=<slug>:1`); "Simulador" no cabeçalho e no rodapé. A Metodologia ganha a seção "Simulador com o meu capital" (`#simulador`).

### 8.7 Metodologia `/metodologia`
Definição de cada métrica, como a coleta funciona, o que é custo, o que é normalização por contrato. Glossário.

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

- Mobile-first. Tema escuro padrão com tema claro.
- Verde pra positivo, vermelho pra negativo, cinza pra neutro. Fonte com números tabulares.
- Skeletons em tudo que carrega, indicador "atualizado há Xs" em tudo que é ao vivo.
- Identidade visual Delta: cores e logo a definir (pendência).
- Fazer com que a página do robô e o fechamento do dia fiquem bons em print de celular, pois vão parar em story e WhatsApp. O fechamento pronto é a imagem do dia (§8.8).

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
