# Plano da Fase 2 (estatísticas completas)

Status: **proposta para aprovação**. Itens marcados com **(+)** não estão na spec.

Escopo da Fase 2 (spec §11): todas as métricas (§7), calendário, heatmap, distribuições, risco, página de operações (§8.3), tela ao vivo (§8.4), metodologia (§8.7), OG image e embed (§8.8). Proponho trazer junto três itens da home que a spec não atribuiu a nenhuma fase: resumo/fechamento do dia (§8.1 item 4), transparência e FAQ (item 14) e ecossistema (item 9). Ver dúvida 3.

---

## 1. Rotas novas

| Rota | Tipo | O que é |
|---|---|---|
| `/robos/[slug]` | existente, completa | ganha período personalizado, seletor de contratos, heatmap, calendário, distribuições, risco, últimas 50 |
| `/robos/[slug]/operacoes` | `(site)` | tabela completa paginada, filtros, CSV, realtime nas de hoje |
| `/robos/[slug]/ao-vivo` | `(tela-cheia)` | só o dia, fonte grande, sem cabeçalho/rodapé, tema escuro fixo |
| `/metodologia` | `(site)` | definição de cada métrica, coleta, custos, normalização, glossário |
| `/embed/[slug]` | `(tela-cheia)` | card leve do robô pra iframe, sem realtime, cache 60s |
| `/api/og/[slug]` | route handler | imagem 1200x630 com resultado do dia, mês, acumulado e status |
| `/api/og/casa` (+) | route handler | OG da home com o resultado da casa |

O grupo `(tela-cheia)` tem layout próprio (sem `Cabecalho`/`Rodape`). Grupos diferentes podem ter rotas sob o mesmo prefixo `/robos/[slug]` desde que as URLs finais sejam distintas.

---

## 2. Dados e migrations

**Uma migration**, `20260912000010_fase2.sql`:
- `robos.relatorio_mt5_url text` (+): link do relatório mensal do MT5 (Drive/Storage), exibido na seção Transparência quando preenchido. Entra em `robos_publico`.
- `multiplicadores.margem_referencia` já existe; precisa de valor (dúvida 1). Entra em `mercado_publico` (já está).
- Nenhuma tabela nova. `estatisticas_cache` continua sem uso (proposta I).

**Consultas novas** (`src/lib/consultas/operacoes.ts`):
- `listarOperacoes(slug, { de, ate, lado, resultado, pagina, tamanho })` com `.range()` e `count: "exact"` sobre `operacoes_publico`.
- `listarOperacoesRecentes(slug, limite = 5000)` pras métricas por operação (distribuições, histograma, sequências). Acima disso o período recorta.

---

## 3. Cálculo (`src/lib/stats`, tudo puro e testado)

| Módulo | Funções |
|---|---|
| `operacoes.ts` (novo) | `porDiaSemana(ops)`, `porHora(ops)` (hora de Brasília do fechamento), `histograma(ops, faixas)`, `sequencias(ops)` (maior sequência de gains e de losses por operação), `resumoOperacoes(ops)` (média gain/loss, maior gain/loss, duração média) |
| `calendario.ts` (novo) | `gradeMes(linhas, "YYYY-MM")` (dias do mês com valor, incluindo dias sem pregão), `heatmapAnoMes(linhas)` (matriz ano x mês com total e nº de dias) |
| `risco.ts` (novo) | `capitalMinimo(margem, drawdown, fator)`, `drawdownsHistoricos(curva)` (lista dos N maiores com início/fundo/recuperação), `perfilRisco(...)` |
| `periodos.ts` | ganha `"personalizado"` com `{ de, ate }` |
| `kpis.ts` | ganha `maiorSequenciaGains/Losses` por operação quando `ops` é passado; hoje é por dia |

Toggles (período, unidade, bruto/líquido, contratos) passam a viver num estado único da página do robô e valem pra KPIs, curva, calendário, heatmap, distribuições e risco ao mesmo tempo.

---

## 4. Componentes

**Página do robô** (`src/components/robo/`)
- `PainelEstatisticas` (client): guarda período/unidade/base/contratos, lê `?periodo=` ou `?de=&ate=` da URL e distribui pros filhos.
- `SeletorPeriodo` (com "personalizado": dois inputs de data), `SeletorContratos` (1, 2, 3, 5, 10, outro) com a frase "com N contratos seria...".
- `HeatmapAnoMes`, `CalendarioMes` (grade em divs, sem lib), `DistribuicaoDiaSemana`, `DistribuicaoHora`, `HistogramaOperacoes` (Recharts, barras), `Risco` (drawdown R$ e %, tempo de recuperação, capital mínimo por contrato, alerta se margem não configurada), `UltimasOperacoes` (50, link pra lista completa).
- `KpisRobo` vira client e passa a receber `ops` pras sequências por operação. Cada KPI ganha link "como calculamos" pra âncora na metodologia.

**Operações** (`src/components/operacoes/`)
- `FiltrosOperacoes` (período, lado, resultado; estado na URL), `TabelaOperacoes` (shadcn Table), `Paginacao`, `BotaoCsv` (gera no cliente com o filtro atual, até 5.000 linhas), realtime só na página 1 sem filtro via `useRoboAoVivo`.

**Ao vivo** (`src/components/ao-vivo/`)
- `TelaAoVivo`: resultado do dia grande, posição aberta, últimas 10 operações, `AtualizadoHa`, botão compartilhar (Web Share API, fallback copia link). Layout pensado pra print vertical de celular.

**Embed e OG**
- `CardEmbed`: versão enxuta do `CardRobo` com link pro site; header `Content-Security-Policy: frame-ancestors *`; `?tema=claro|escuro`.
- `/api/og/[slug]` com `ImageResponse` de `next/og`, fonte Geist embutida, cache `s-maxage=60`. `generateMetadata` do robô passa a apontar pra ela.

**Home** (se aprovado na dúvida 3)
- `ResumoDoDia`: operações feitas, acerto do dia, melhor robô do dia; após o fechamento do pregão vira "Fechamento de hoje" com layout pra print. Usa `resumo_casa_hoje()` que já existe.
- `TransparenciaFaq`: 6 a 8 perguntas comuns + disclaimer + link pra metodologia.
- `Ecossistema`: três cards (treinamentos, painel de mercado, programa de pontos) com links de `parametros`; some se não houver link.

**Metodologia** (`/metodologia`): conteúdo estático em componentes de texto, uma seção por métrica com fórmula em palavras, seção de coleta (EA, heartbeat, reconciliação), custos, normalização, glossário. Âncoras por métrica.

---

## 5. Ordem de execução

1. Migration 0010 + módulos de cálculo com testes.
2. Página do robô completa (estado único, seções novas).
3. Página de operações.
4. Tela ao vivo.
5. Metodologia.
6. OG e embed.
7. Itens da home (4, 14, 9).
8. `npm run build`, testes, lint, deploy, checagem no celular.

Critérios de aceite propostos (a spec não define pra Fase 2): toda métrica da §7 visível na página do robô; filtros e CSV funcionando; ao vivo e embed carregam em menos de 1 s; OG aparece no preview do WhatsApp; Lighthouse mobile sem regressão.

---

## 6. Dúvidas

### Bloqueantes
1. **Margem de referência por contrato** (WIN e WDO) pro "capital mínimo recomendado". Qual valor usar? Vai em `multiplicadores.margem_referencia`.
2. **Relatório mensal do MT5**: onde os arquivos vão morar? Proposta: um link por robô (`robos.relatorio_mt5_url`), preenchido à mão até o admin da Fase 3.
3. **Itens da home sem fase definida**: incluo resumo/fechamento do dia (item 4), transparência e FAQ (14) e ecossistema (9) nesta fase? Recomendo sim; o 9 só aparece se houver links.
4. **Dados pra validar**: ainda não há operação real. Posso criar um robô `teste` com status `arquivado` (não aparece na home, acessível pela URL) e deals fictícios via SQL pra conferir gráficos e distribuições? Apago ao final da fase.

### Propostas (sigo assim se você não objetar)
A. Período personalizado na URL (`?de=&ate=`), compartilhável; KPIs passam a respeitar o período escolhido (hoje são "desde o início").
B. Seletor de contratos multiplica tudo, inclusive capital mínimo.
C. Operações: 50 por página, filtros na URL, CSV no cliente.
D. Ao vivo com tema escuro fixo e fonte grande, sem cabeçalho.
E. Embed sem realtime (cache 60s) pra ser leve; OG com cache 60s.
F. `estatisticas_cache` continua sem uso; OG e embed leem as views.
G. Métricas por operação usam as 5.000 operações mais recentes; período recorta o resto.
H. Sequências de gains/losses passam a ser por operação (a spec pede assim); a versão por dia continua como KPI separado.
