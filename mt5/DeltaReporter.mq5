//+------------------------------------------------------------------+
//|                                                DeltaReporter.mq5 |
//|                                     Coletor da Delta Robôs (MT5) |
//|                                                                  |
//|  SÓ LÊ. Não abre, não fecha, não modifica ordem nenhuma.         |
//|  Roda num gráfico próprio em cada terminal da matriz e envia:    |
//|    - cada deal fechado (+ MFE/MAE)  -> POST /api/ingest/deal     |
//|    - balance/equity/posições/       -> POST /api/ingest/heartbeat|
//|      cotações/MEP-MEN do dia a cada N segundos                   |
//|    - últimos N dias no init         -> POST /api/ingest/history  |
//|    - candles M1 fechados (opcional) -> POST /api/ingest/candles  |
//|                                                                  |
//|  v1.1.0 mede tick a tick, só em memória: entre um heartbeat e o  |
//|  outro o timer lê os ticks novos dos símbolos com posição aberta |
//|  e guarda a máxima excursão a favor/contra de cada posição (MFE/ |
//|  MAE, em pontos por contrato) e o máximo/mínimo do saldo do dia  |
//|  por magic (MEP/MEN, R$ brutos por contrato). WebRequest é       |
//|  síncrono, então rede só no slot do heartbeat.                   |
//|                                                                  |
//|  Configuração no MT5: Ferramentas > Opções > Expert Advisors >   |
//|  "Permitir WebRequest para as URLs listadas" e adicionar a URL.  |
//+------------------------------------------------------------------+
#property copyright   "Delta Robôs"
#property version     "1.10"
#property description "Envia deals, posições, heartbeat, MFE/MAE, MEP/MEN e candles da conta para o site da Delta Robôs. Não opera."
#property strict

//--- inputs
input string InpUrlBase       = "https://deltarobos-mu.vercel.app"; // URL base da API (sem barra no final)
input string InpToken         = "";                           // Token da conta (gerado no banco/admin)
input int    InpHeartbeatSeg  = 3;                            // Intervalo do heartbeat (segundos)
input int    InpDiasHistorico = 7;                            // Dias de histórico reenviados no init
input int    InpTimeoutMs     = 3000;                         // Timeout HTTP (ms)
input int    InpTimeoutHistMs = 20000;                        // Timeout HTTP do histórico (ms)
input string InpSimbolos      = "";                           // Símbolos extras pra cotação (ex.: WINV26,WDOV26)
input bool   InpLog           = true;                         // Log na aba Especialistas
input bool   InpExcursao      = true;                         // Mede MFE/MAE e MEP/MEN tick a tick
input int    InpAmostraMs     = 100;                          // Amostragem dos ticks (ms, 50..1000)
input bool   InpEnviaCandles  = false;                        // Envia candles M1 fechados (ligar em UM terminal só)
input string InpCandlesSimbolo = "";                          // Símbolo dos candles (vazio = o do gráfico)
input int    InpCandlesBackfillMin = 600;                     // Minutos de candles reenviados no init

#define EA_VERSAO         "1.1.0"
#define FILA_MAX          500
#define PAGINA_HIST       100
#define TICKS_PAGINA      4096     // ticks por CopyTicks
#define TICKS_PAGINAS_MAX 4        // páginas por amostra (só o replay de posição restaurada chega nisso)
#define SUMIDA_MS         120000   // posição fora do PositionsTotal espera o DEAL_ADD por 120 s
#define CANDLES_PAGINA    200
#define GV_PREFIXO        "DR_"

//--- fila de reenvio (só deals; heartbeat velho não tem valor)
string g_fila_caminho[];
string g_fila_corpo[];
int    g_fila_n = 0;

//--- depois que a fila do histórico esvazia, pede uma reconciliação ao servidor
bool   g_reconciliar_pendente = false;

//--- símbolos vistos (posições + deals + gráfico + extras) pra cotação
string g_simbolos[];

//--- último código HTTP (Http devolve true também nos 4xx que saem da fila)
int    g_http_codigo = 0;

//--- medição tick a tick: uma Excursao por ciclo de posição aberta
struct Excursao
  {
   ulong  posicao_id;      // POSITION_IDENTIFIER (não muda na reversão; o ticket muda)
   int    ciclo;           // 1 + reversões (INOUT) da posição, igual ao pareamento do site
   long   magic;
   string simbolo;
   int    sim_idx;         // índice em g_tick_sim
   int    lado;            // 0 compra, 1 venda
   double preco_abertura;  // média das entradas do ciclo
   double vol_entradas;    // soma das entradas do ciclo (normaliza por 1 contrato)
   double vol_viva;        // volume ainda aberto
   double atual;           // excursão no último tick (pontos)
   double mfe;             // >= 0, pontos por contrato
   double mae;             // <= 0
   long   mfe_msc;
   long   mae_msc;
   long   abertura_msc;    // tick anterior à abertura não conta
   long   fim_msc;         // saída já conhecida: tick posterior não conta (0 = viva)
   bool   parcial;         // o EA não viu a posição desde a abertura
   bool   visto;           // uso interno da sincronização
   bool   gv_sujo;         // extremo novo ainda não gravado nas GlobalVariables
   ulong  sumiu_ms;        // GetTickCount64 de quando saiu do PositionsTotal (0 = viva)
   long   ultimo_msc;      // último tick aplicado: o DealAntes rebobina daqui (tick lido com a posição sumida/virada não se perde)
   ulong  gv_ms;           // GetTickCount64 da última gravação nas GlobalVariables
  };

//--- MEP/MEN do dia por magic (saldo = realizado do dia + flutuante das posições do magic)
struct ExposicaoDia
  {
   long   magic;
   int    dia;             // dias desde 1970 no relógio do servidor
   int    n_saidas;
   int    mep_n;
   int    men_n;
   double realizado_pc;    // R$ brutos por contrato das saídas do dia
   double flut_pc;         // idem, posições vivas
   double mep;
   double men;
   long   mep_msc;
   long   men_msc;
   bool   parcial;         // já havia deal (ou posição) antes do EA subir
  };

Excursao     g_exc[];
ExposicaoDia g_exp[];
string       g_tick_sim[];      // símbolos com leitura de ticks
long         g_tick_msc[];      // último tick lido por símbolo (0 = parado)
double       g_tick_vp[];       // R$ por ponto por contrato do símbolo
MqlTick      g_ticks[];         // buffer reaproveitado do CopyTicks
int          g_dia = 0;         // dia do servidor da exposição corrente
long         g_inicio_msc = 0;  // tick anterior ao init não mexe no MEP/MEN (só no MFE/MAE)
ulong        g_ultimo_deal_contab = 0; // maior deal já somado na semeadura (não contar 2x)
int          g_amostra_ms = 100;
ulong        g_ultimo_hb_ms = 0;
bool         g_candle_ok = false;      // g_candle_ate já foi inicializado
datetime     g_candle_ate = 0;         // última barra M1 aceita pelo servidor
datetime     g_candle_t0 = 0;          // barra corrente na última tentativa
bool         g_candle_atrasado = false; // ficou página pra enviar no próximo slot

//+------------------------------------------------------------------+
//| Utilidades                                                       |
//+------------------------------------------------------------------+
void Log(string msg)
  {
   if(InpLog) Print("[DeltaReporter] ", msg);
  }

// Escapa uma string pra JSON
string JsonStr(string s)
  {
   string r = s;
   StringReplace(r, "\\", "\\\\");
   StringReplace(r, "\"", "\\\"");
   StringReplace(r, "\n", " ");
   StringReplace(r, "\r", " ");
   StringReplace(r, "\t", " ");
   return "\"" + r + "\"";
}

string Bool(bool v)
  {
   return (v ? "true" : "false");
  }

// Diferença (segundos) entre o relógio do servidor e o UTC. Os dois relógios são truncados ao
// segundo com fases diferentes, então a subtração crua oscila ±1 s (um candle sairia "13:40:01Z",
// minuto errado na chave de candles); fuso de servidor é sempre múltiplo de 15 min: arredonda.
long OffsetServidorSeg()
  {
   long d = (long)(TimeTradeServer() - TimeGMT());
   return (long)MathRound(d / 900.0) * 900;
  }

// datetime do servidor (+ms) -> ISO 8601 em UTC
string IsoUtc(datetime t_servidor, int ms = 0)
  {
   datetime utc = t_servidor - (datetime)OffsetServidorSeg();
   MqlDateTime d;
   TimeToStruct(utc, d);
   return StringFormat("\"%04d-%02d-%02dT%02d:%02d:%02d.%03dZ\"",
                       d.year, d.mon, d.day, d.hour, d.min, d.sec, ms);
  }

// ms desde epoch (servidor) -> ISO UTC
string IsoUtcMsc(long msc)
  {
   if(msc <= 0) return IsoUtc(TimeCurrent());
   return IsoUtc((datetime)(msc / 1000), (int)(msc % 1000));
  }

// Dia do servidor (dias desde 1970). O servidor da B3 está em Brasília, então é o dia do pregão.
int DiaServidor()
  {
   return (int)(TimeTradeServer() / 86400);
  }

// "2026-09-22" (com aspas) a partir do dia do servidor
string DiaIso(int dia)
  {
   MqlDateTime d;
   TimeToStruct((datetime)((long)dia * 86400), d);
   return StringFormat("\"%04d-%02d-%02d\"", d.year, d.mon, d.day);
  }

long MscServidor()
  {
   return (long)TimeTradeServer() * 1000;
  }

string Num(double v, int digitos)
  {
   return DoubleToString(v, digitos);
  }

int DigitosDe(string simbolo)
  {
   long d = SymbolInfoInteger(simbolo, SYMBOL_DIGITS);
   if(d <= 0 || d > 8) return 3;
   return (int)d;
  }

void LembrarSimbolo(string simbolo)
  {
   if(simbolo == "") return;
   for(int i = 0; i < ArraySize(g_simbolos); i++)
      if(g_simbolos[i] == simbolo) return;
   int n = ArraySize(g_simbolos);
   ArrayResize(g_simbolos, n + 1);
   g_simbolos[n] = simbolo;
  }

// R$ por 1 ponto de preço por contrato. WIN: tick de 5 pontos vale R$ 1,00 -> 0,20/ponto.
// WDO: tick de 0,5 vale R$ 5,00 -> 10,00/ponto. "Ponto" aqui é unidade de preço, igual ao site.
double ValorPonto(string simbolo)
  {
   double tv = SymbolInfoDouble(simbolo, SYMBOL_TRADE_TICK_VALUE);
   double ts = SymbolInfoDouble(simbolo, SYMBOL_TRADE_TICK_SIZE);
   if(tv <= 0 || ts <= 0) return 0;
   return tv / ts;
  }

void LogValorPonto(string simbolo)
  {
   double tv = SymbolInfoDouble(simbolo, SYMBOL_TRADE_TICK_VALUE);
   double ts = SymbolInfoDouble(simbolo, SYMBOL_TRADE_TICK_SIZE);
   double vp = ValorPonto(simbolo);
   if(vp <= 0)
      Log(StringFormat("%s: valor por ponto desconhecido (tick_value %.4f, tick_size %.4f); MEP/MEN sem o flutuante deste símbolo",
                       simbolo, tv, ts));
   else
      Log(StringFormat("%s: R$ %.4f por ponto por contrato (tick de %s = R$ %.4f)",
                       simbolo, vp, DoubleToString(ts, DigitosDe(simbolo)), tv));
  }

//+------------------------------------------------------------------+
//| HTTP                                                             |
//+------------------------------------------------------------------+
// Devolve true se a API respondeu 2xx (ou um 4xx que não adianta repetir; veja o fim).
// Em -1 explica a liberação de URL. O código fica em g_http_codigo.
bool Http(string metodo, string caminho, string corpo, string &resposta, int timeout_ms = 0)
  {
   string url = InpUrlBase + caminho;
   int    timeout = (timeout_ms > 0 ? timeout_ms : InpTimeoutMs);
   string cabecalhos = "Content-Type: application/json\r\n"
                       "Accept: application/json\r\n"
                       "Authorization: Bearer " + InpToken + "\r\n";
   uchar dados[];
   uchar resultado[];
   string cabecalhos_resp;

   if(corpo != "")
     {
      StringToCharArray(corpo, dados, 0, StringLen(corpo), CP_UTF8);
      // StringToCharArray inclui o terminador nulo: remove
      int n = ArraySize(dados);
      if(n > 0 && dados[n - 1] == 0) ArrayResize(dados, n - 1);
     }

   ResetLastError();
   int codigo = WebRequest(metodo, url, cabecalhos, timeout, dados, resultado, cabecalhos_resp);
   g_http_codigo = codigo;

   if(codigo == -1)
     {
      int erro = GetLastError();
      if(erro == 4014)
         Log("WebRequest bloqueado. Libere a URL " + InpUrlBase +
             " em Ferramentas > Opções > Expert Advisors > Permitir WebRequest.");
      else
         Log(StringFormat("WebRequest falhou (%s %s): erro %d", metodo, caminho, erro));
      resposta = "";
      return false;
     }

   resposta = CharArrayToString(resultado, 0, WHOLE_ARRAY, CP_UTF8);

   if(codigo >= 200 && codigo < 300) return true;

   // 1001..1004 são códigos internos do MT5 (conexão/timeout), não HTTP
   if(codigo >= 1001 && codigo <= 1004)
      Log(StringFormat("falha de rede %d em %s %s (%d bytes, timeout %d ms)",
                       codigo, metodo, caminho, ArraySize(dados), timeout));
   else
      Log(StringFormat("HTTP %d em %s %s (%d bytes): %s",
                       codigo, metodo, caminho, ArraySize(dados), StringSubstr(resposta, 0, 300)));
   // 429 (limite por minuto): fica na fila e tenta no próximo timer.
   // 400/401/404/413/422: reenviar não resolve; sai da fila pra não travar (o log já avisou).
   if(codigo == 429) return false;
   return (codigo == 400 || codigo == 401 || codigo == 404 || codigo == 413 || codigo == 422);
  }

void Enfileirar(string caminho, string corpo)
  {
   if(g_fila_n >= FILA_MAX)
     {
      // descarta o mais antigo
      for(int i = 1; i < g_fila_n; i++)
        {
         g_fila_caminho[i - 1] = g_fila_caminho[i];
         g_fila_corpo[i - 1]   = g_fila_corpo[i];
        }
      g_fila_n--;
     }
   ArrayResize(g_fila_caminho, g_fila_n + 1);
   ArrayResize(g_fila_corpo, g_fila_n + 1);
   g_fila_caminho[g_fila_n] = caminho;
   g_fila_corpo[g_fila_n]   = corpo;
   g_fila_n++;
   Log(StringFormat("na fila: %d", g_fila_n));
  }

// Envia UM item da fila por chamada (o heartbeat nunca espera a fila inteira).
// Em falha o item fica na fila e tenta de novo no próximo timer.
void ReenviarUm()
  {
   if(g_fila_n == 0) return;

   string resp;
   bool historico = (StringFind(g_fila_caminho[0], "/history") >= 0);
   int  timeout   = (historico ? InpTimeoutHistMs : 0);
   if(!Http("POST", g_fila_caminho[0], g_fila_corpo[0], resp, timeout)) return;

   if(historico) Log(StringFormat("página de histórico ok, restam %d na fila", g_fila_n - 1));

   for(int i = 1; i < g_fila_n; i++)
     {
      g_fila_caminho[i - 1] = g_fila_caminho[i];
      g_fila_corpo[i - 1]   = g_fila_corpo[i];
     }
   g_fila_n--;
   ArrayResize(g_fila_caminho, g_fila_n);
   ArrayResize(g_fila_corpo, g_fila_n);

   // fila zerou depois de um histórico: fecha o que ficou pendurado
   if(g_fila_n == 0 && g_reconciliar_pendente)
     {
      g_reconciliar_pendente = false;
      Reconciliar();
     }
  }

//+------------------------------------------------------------------+
//| Excursões: estado em memória                                     |
//+------------------------------------------------------------------+
void ZerarExcursao(Excursao &e)
  {
   e.posicao_id = 0;
   e.ciclo = 1;
   e.magic = 0;
   e.simbolo = "";
   e.sim_idx = -1;
   e.lado = 0;
   e.preco_abertura = 0;
   e.vol_entradas = 0;
   e.vol_viva = 0;
   e.atual = 0;
   e.mfe = 0;
   e.mae = 0;
   e.mfe_msc = 0;
   e.mae_msc = 0;
   e.abertura_msc = 0;
   e.fim_msc = 0;
   e.parcial = false;
   e.visto = false;
   e.gv_sujo = false;
   e.sumiu_ms = 0;
   e.ultimo_msc = 0;
   e.gv_ms = 0;
  }

int ProcurarExc(ulong posicao_id)
  {
   for(int i = 0; i < ArraySize(g_exc); i++)
      if(g_exc[i].posicao_id == posicao_id) return i;
   return -1;
  }

void RemoverExcursao(int i)
  {
   int n = ArraySize(g_exc);
   for(int j = i + 1; j < n; j++) g_exc[j - 1] = g_exc[j];
   ArrayResize(g_exc, n - 1);
  }

// Índice do símbolo na leitura de ticks (cria se não existe)
int TickSimboloIdx(string simbolo)
  {
   for(int i = 0; i < ArraySize(g_tick_sim); i++)
      if(g_tick_sim[i] == simbolo) return i;
   int n = ArraySize(g_tick_sim);
   ArrayResize(g_tick_sim, n + 1);
   ArrayResize(g_tick_msc, n + 1);
   ArrayResize(g_tick_vp, n + 1);
   SymbolSelect(simbolo, true);   // CopyTicks precisa do símbolo na Observação do Mercado
   g_tick_sim[n] = simbolo;
   g_tick_msc[n] = 0;
   g_tick_vp[n]  = ValorPonto(simbolo);
   LogValorPonto(simbolo);
   return n;
  }

// Volta a leitura de ticks do símbolo até desde_msc (replay idempotente: max/min não mudam
// com tick repetido). desde_msc <= 0 = a partir do tick corrente.
void RebasearTicks(int s, long desde_msc)
  {
   if(s < 0) return;
   if(desde_msc <= 0)
     {
      MqlTick t;
      desde_msc = (SymbolInfoTick(g_tick_sim[s], t) ? t.time_msc : MscServidor());
     }
   if(g_tick_msc[s] == 0 || g_tick_msc[s] > desde_msc) g_tick_msc[s] = desde_msc;
  }

//--- GlobalVariables: DR_<posicao>_<ciclo>_{mfe,mae,mfe_t,mae_t,t,p}. Sobrevivem a reinício do
//--- EA/terminal (o MT5 guarda em disco); nome curto porque o limite é 63 caracteres.
//--- t = até onde (time_msc) os ticks foram aplicados; p = 1 se a medição já era parcial.
string GvNome(ulong posicao_id, int ciclo, string campo)
  {
   return StringFormat("%s%I64u_%d_%s", GV_PREFIXO, posicao_id, ciclo, campo);
  }

bool LerGv(Excursao &e)
  {
   string n = GvNome(e.posicao_id, e.ciclo, "mfe");
   if(!GlobalVariableCheck(n)) return false;
   e.mfe     = GlobalVariableGet(n);
   e.mae     = GlobalVariableGet(GvNome(e.posicao_id, e.ciclo, "mae"));
   e.mfe_msc = (long)GlobalVariableGet(GvNome(e.posicao_id, e.ciclo, "mfe_t"));
   e.mae_msc = (long)GlobalVariableGet(GvNome(e.posicao_id, e.ciclo, "mae_t"));
   e.parcial = (GlobalVariableGet(GvNome(e.posicao_id, e.ciclo, "p")) > 0.5);   // ausente = 0 = completa
   if(e.mfe < 0) e.mfe = 0;
   if(e.mae > 0) e.mae = 0;
   return true;
  }

void GravarGv(Excursao &e)
  {
   GlobalVariableSet(GvNome(e.posicao_id, e.ciclo, "mfe"),   e.mfe);
   GlobalVariableSet(GvNome(e.posicao_id, e.ciclo, "mae"),   e.mae);
   GlobalVariableSet(GvNome(e.posicao_id, e.ciclo, "mfe_t"), (double)e.mfe_msc);
   GlobalVariableSet(GvNome(e.posicao_id, e.ciclo, "mae_t"), (double)e.mae_msc);
   // até onde os ticks foram aplicados e se a medição é parcial: o próximo init continua daqui
   // (reaplica a lacuna pela base de ticks) sem esquecer que o começo não foi visto
   if(e.sim_idx >= 0) GlobalVariableSet(GvNome(e.posicao_id, e.ciclo, "t"), (double)g_tick_msc[e.sim_idx]);
   GlobalVariableSet(GvNome(e.posicao_id, e.ciclo, "p"), (e.parcial ? 1.0 : 0.0));
   e.gv_sujo = false;
   e.gv_ms   = GetTickCount64();
  }

void ApagarGv(ulong posicao_id, int ciclo)
  {
   GlobalVariableDel(GvNome(posicao_id, ciclo, "mfe"));
   GlobalVariableDel(GvNome(posicao_id, ciclo, "mae"));
   GlobalVariableDel(GvNome(posicao_id, ciclo, "mfe_t"));
   GlobalVariableDel(GvNome(posicao_id, ciclo, "mae_t"));
   GlobalVariableDel(GvNome(posicao_id, ciclo, "t"));
   GlobalVariableDel(GvNome(posicao_id, ciclo, "p"));
  }

// Uma gravação por amostra quando houve extremo novo, e pelo menos uma por segundo para o "t"
// (até onde os ticks foram aplicados) não envelhecer. todas = grava tudo (deinit).
void GravarGvSujas(bool todas = false)
  {
   ulong agora = GetTickCount64();
   for(int i = 0; i < ArraySize(g_exc); i++)
      if(todas || g_exc[i].gv_sujo || agora - g_exc[i].gv_ms >= 1000) GravarGv(g_exc[i]);
  }

// GV de posição que fechou enquanto o EA estava fora (ou de ciclo antigo)
void LimparGvOrfas()
  {
   int apagadas = 0;
   for(int i = GlobalVariablesTotal() - 1; i >= 0; i--)
     {
      string nome = GlobalVariableName(i);
      if(StringFind(nome, GV_PREFIXO) != 0) continue;
      string partes[];
      if(StringSplit(nome, '_', partes) < 4) continue;
      ulong pos   = (ulong)StringToInteger(partes[1]);
      int   ciclo = (int)StringToInteger(partes[2]);
      int   k     = ProcurarExc(pos);
      if(k >= 0 && g_exc[k].ciclo == ciclo) continue;
      GlobalVariableDel(nome);
      apagadas++;
     }
   if(apagadas > 0) Log(StringFormat("%d GlobalVariables órfãs apagadas", apagadas));
  }

// Reconstrói o ciclo corrente da posição pelos deals dela (HistorySelectByPosition troca o
// cache de histórico: quem chamou reseleciona o que precisar). ate_deal > 0 devolve o estado
// ANTES daquele deal (usado na semeadura do dia). vivo = volume ainda aberto.
bool LerPosicaoDoHistorico(ulong posicao_id, ulong ate_deal, Excursao &e, double &vivo)
  {
   vivo = 0;
   if(!HistorySelectByPosition((long)posicao_id)) return false;
   double soma_pv = 0;
   bool   magic_ok = false;
   int n = HistoryDealsTotal();
   for(int k = 0; k < n; k++)
     {
      ulong t = HistoryDealGetTicket(k);
      if(t == 0) continue;
      if(ate_deal > 0 && t == ate_deal) break;
      long tipo = HistoryDealGetInteger(t, DEAL_TYPE);
      if(tipo != DEAL_TYPE_BUY && tipo != DEAL_TYPE_SELL) continue;
      long   entry = HistoryDealGetInteger(t, DEAL_ENTRY);
      double v     = HistoryDealGetDouble(t, DEAL_VOLUME);
      double p     = HistoryDealGetDouble(t, DEAL_PRICE);
      if(!magic_ok)
        {
         // o magic da posição é o da abertura (fechamento manual vem com magic 0)
         e.magic   = HistoryDealGetInteger(t, DEAL_MAGIC);
         e.simbolo = HistoryDealGetString(t, DEAL_SYMBOL);
         magic_ok  = true;
        }
      if(entry == DEAL_ENTRY_IN)
        {
         if(e.vol_entradas <= 0)
           {
            e.lado = (tipo == DEAL_TYPE_BUY ? 0 : 1);
            e.abertura_msc = HistoryDealGetInteger(t, DEAL_TIME_MSC);
           }
         vivo += v;
         e.vol_entradas += v;
         soma_pv += p * v;
         e.preco_abertura = soma_pv / e.vol_entradas;
        }
      else if(entry == DEAL_ENTRY_INOUT)
        {
         // reversão: o que sobrou abre o ciclo seguinte no sentido oposto
         double novo = v - vivo;
         if(novo < 0) novo = 0;
         e.ciclo++;
         vivo = novo;
         e.vol_entradas = novo;
         soma_pv = p * novo;
         e.preco_abertura = p;
         e.lado = (tipo == DEAL_TYPE_BUY ? 0 : 1);
         e.abertura_msc = HistoryDealGetInteger(t, DEAL_TIME_MSC);
        }
      else
        {
         vivo -= v;
         if(vivo < 0) vivo = 0;
        }
     }
   return (e.vol_entradas > 0);
  }

// Começa a acompanhar uma posição. restaurada = já existia antes do EA subir: tenta continuar
// das GV; sem GV fica parcial. Devolve o índice em g_exc ou -1.
int CriarExcursao(ulong posicao_id, bool restaurada)
  {
   Excursao e;
   ZerarExcursao(e);
   double vivo = 0;
   if(!LerPosicaoDoHistorico(posicao_id, 0, e, vivo))
     {
      // sem deal no cache: usa a posição selecionada (o chamador acabou de selecionar, ou
      // o ticket ainda é o identificador, como em toda posição sem reversão)
      if(PositionGetInteger(POSITION_IDENTIFIER) != (long)posicao_id && !PositionSelectByTicket(posicao_id))
         return -1;
      ZerarExcursao(e);
      e.simbolo        = PositionGetString(POSITION_SYMBOL);
      e.magic          = PositionGetInteger(POSITION_MAGIC);
      e.lado           = (int)PositionGetInteger(POSITION_TYPE);
      e.preco_abertura = PositionGetDouble(POSITION_PRICE_OPEN);
      e.vol_entradas   = PositionGetDouble(POSITION_VOLUME);
      e.abertura_msc   = PositionGetInteger(POSITION_TIME_MSC);
      vivo             = e.vol_entradas;
     }
   if(e.vol_entradas <= 0 || e.simbolo == "") return -1;

   e.posicao_id = posicao_id;
   e.vol_viva   = vivo;
   e.sim_idx    = TickSimboloIdx(e.simbolo);
   LembrarSimbolo(e.simbolo);

   // aberta antes do init também conta como restaurada (o EA não viu o começo)
   if(e.abertura_msc < g_inicio_msc) restaurada = true;
   bool com_gv = false;
   if(restaurada)
     {
      com_gv = LerGv(e);          // com GV continua de onde parou (e lembra se já era parcial)
      if(!com_gv) e.parcial = true;
     }

   int n = ArraySize(g_exc);
   ArrayResize(g_exc, n + 1);
   g_exc[n] = e;

   // Ticks desde a abertura: posição nova pega o que passou entre o deal e esta amostra;
   // restaurada sem GV (ou parcial) tenta recuperar o MFE/MAE pela base de ticks do terminal.
   // Com GV completa, reaplica só a lacuna desde a última gravação (recompilação, troca de
   // parâmetro, reinício do terminal): o replay é idempotente e a lacuna está na base de ticks.
   long desde = e.abertura_msc;
   if(com_gv && !e.parcial)
     {
      long gv_t = (long)GlobalVariableGet(GvNome(e.posicao_id, e.ciclo, "t"));
      desde = (gv_t > 0 ? gv_t : 0);
      if(gv_t > 0 && gv_t < g_inicio_msc) g_inicio_msc = gv_t;   // MEP/MEN também reconstroem a lacuna
     }
   RebasearTicks(e.sim_idx, desde);

   Log(StringFormat("posição %I64u ciclo %d %s %s: acompanhando desde %s (%s)",
                    posicao_id, e.ciclo, e.simbolo, (e.lado == 0 ? "compra" : "venda"),
                    Num(e.preco_abertura, DigitosDe(e.simbolo)),
                    (!restaurada ? "nova"
                     : (!com_gv ? "restaurada sem GV, parcial"
                        : (e.parcial ? "restaurada das GV, parcial" : "restaurada das GV")))));
   return n;
  }

int ProcurarExp(long magic, bool criar)
  {
   for(int x = 0; x < ArraySize(g_exp); x++)
      if(g_exp[x].magic == magic) return x;
   if(!criar) return -1;
   int n = ArraySize(g_exp);
   ArrayResize(g_exp, n + 1);
   ExposicaoDia z;
   ZeroMemory(z);
   z.magic = magic;
   z.dia   = g_dia;
   g_exp[n] = z;
   return n;
  }

// Recalcula o saldo do magic (realizado do dia + flutuante por contrato) e os extremos
void AtualizarExposicao(long magic, long msc)
  {
   int x = ProcurarExp(magic, true);
   double flut = 0;
   for(int i = 0; i < ArraySize(g_exc); i++)
     {
      if(g_exc[i].magic != magic || g_exc[i].sumiu_ms != 0 || g_exc[i].vol_entradas <= 0) continue;
      // ainda em replay de ticks anteriores ao init (restaurada sem GV): o "atual" é de um preço
      // antigo e misturaria passado com presente no saldo do magic
      if(g_exc[i].ultimo_msc > 0 && g_exc[i].ultimo_msc < g_inicio_msc) continue;
      // saída parcial: o que já realizou saiu do flutuante na mesma proporção
      flut += g_exc[i].atual * g_tick_vp[g_exc[i].sim_idx] * (g_exc[i].vol_viva / g_exc[i].vol_entradas);
     }
   g_exp[x].flut_pc = flut;
   double saldo = g_exp[x].realizado_pc + flut;
   if(saldo > g_exp[x].mep)
     {
      g_exp[x].mep     = saldo;
      g_exp[x].mep_msc = msc;
      g_exp[x].mep_n   = g_exp[x].n_saidas;
     }
   if(saldo < g_exp[x].men)
     {
      g_exp[x].men     = saldo;
      g_exp[x].men_msc = msc;
      g_exp[x].men_n   = g_exp[x].n_saidas;
     }
  }

// Um preço num instante, pra excursão i
void AplicarPreco(int i, double px, long msc)
  {
   if(px <= 0) return;
   double exc = (g_exc[i].lado == 0 ? px - g_exc[i].preco_abertura : g_exc[i].preco_abertura - px);
   g_exc[i].atual      = exc;
   g_exc[i].ultimo_msc = msc;
   if(exc > g_exc[i].mfe)
     {
      g_exc[i].mfe     = exc;
      g_exc[i].mfe_msc = msc;
      g_exc[i].gv_sujo = true;
     }
   if(exc < g_exc[i].mae)
     {
      g_exc[i].mae     = exc;
      g_exc[i].mae_msc = msc;
      g_exc[i].gv_sujo = true;
     }
   if(msc >= g_inicio_msc) AtualizarExposicao(g_exc[i].magic, msc);
  }

// Um tick do símbolo s em todas as posições vivas dele
void AplicarTick(int s, const MqlTick &t)
  {
   int n = ArraySize(g_exc);
   for(int i = 0; i < n; i++)
     {
      if(g_exc[i].sim_idx != s) continue;
      if(g_exc[i].sumiu_ms != 0 && g_exc[i].fim_msc == 0) continue;   // sumiu sem deal ainda
      if(t.time_msc < g_exc[i].abertura_msc) continue;
      if(g_exc[i].fim_msc > 0 && t.time_msc > g_exc[i].fim_msc) continue;
      // índice/dólar: último negócio; sem "last" usa o lado que fecharia a posição
      double px = (t.last > 0 ? t.last : (g_exc[i].lado == 0 ? t.bid : t.ask));
      AplicarPreco(i, px, t.time_msc);
     }
  }

// Ticks novos do símbolo s desde g_tick_msc[s] (inclusive: repetido é inofensivo)
void LerTicks(int s)
  {
   if(g_tick_msc[s] == 0) return;
   string sim = g_tick_sim[s];
   // valor por ponto que veio 0 no cadastro (símbolo recém-posto na Observação do Mercado, ainda
   // sem sincronizar): tenta de novo a cada amostra, senão o flutuante do símbolo some do MEP/MEN
   if(g_tick_vp[s] <= 0)
     {
      g_tick_vp[s] = ValorPonto(sim);
      if(g_tick_vp[s] > 0) LogValorPonto(sim);
     }
   for(int pag = 0; pag < TICKS_PAGINAS_MAX; pag++)
     {
      ResetLastError();
      int n = CopyTicks(sim, g_ticks, COPY_TICKS_ALL, (ulong)g_tick_msc[s], (uint)TICKS_PAGINA);
      if(n < 0)
        {
         // -1: base de ticks ainda sincronizando; usa o tick corrente pra não ficar cego, mas NÃO
         // avança o ponteiro: a próxima amostra tenta o replay de novo (tick repetido é inofensivo)
         MqlTick t;
         if(SymbolInfoTick(sim, t) && t.time_msc >= g_tick_msc[s]) AplicarTick(s, t);
         return;
        }
      for(int k = 0; k < n; k++) AplicarTick(s, g_ticks[k]);
      if(n > 0) g_tick_msc[s] = g_ticks[n - 1].time_msc;
      if(n < TICKS_PAGINA) return;
     }
  }

// Casa g_exc com o PositionsTotal (por POSITION_IDENTIFIER). Posição que apareceu antes do
// DEAL_ADD chegar entra aqui; posição que sumiu espera SUMIDA_MS pelo deal e depois sai.
void SincronizarPosicoes()
  {
   for(int i = 0; i < ArraySize(g_exc); i++) g_exc[i].visto = false;
   ulong agora = GetTickCount64();

   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      ulong pos = (ulong)PositionGetInteger(POSITION_IDENTIFIER);
      int k = ProcurarExc(pos);
      if(k < 0)
        {
         k = CriarExcursao(pos, false);
         if(k < 0) continue;
        }
      g_exc[k].visto = true;
      if(g_exc[k].fim_msc == 0 && (int)PositionGetInteger(POSITION_TYPE) != g_exc[k].lado)
        {
         // o terminal já mostra a posição virada (reversão), mas o DEAL_ADD ainda não chegou: congela
         // (AplicarTick pula sumida sem deal) pro tick desse intervalo não entrar no ciclo que fecha
         // com o sinal errado; o DealAntes rebobina e fecha o ciclo com o preço da reversão
         if(g_exc[k].sumiu_ms == 0) g_exc[k].sumiu_ms = agora;
         else if(agora - g_exc[k].sumiu_ms >= SUMIDA_MS)
           {
            // o deal nunca chegou (rede de segurança): abre o ciclo novo pelo histórico
            Log(StringFormat("posição %I64u virou de lado e o deal não chegou em %d s; ciclo refeito pelo histórico",
                             pos, SUMIDA_MS / 1000));
            if(!RecriarCiclo(k)) g_exc[k].sumiu_ms = agora;   // histórico ainda sem a reversão: espera mais
           }
         continue;
        }
      if(g_exc[k].fim_msc > 0)
        {
         // já fechou pelo deal; o terminal só não atualizou ainda. Se continuar
         // aparecendo por 5 s, o deal não fechou tudo: volta a viver.
         if(agora - g_exc[k].sumiu_ms < 5000) continue;
         g_exc[k].fim_msc = 0;
         Log(StringFormat("posição %I64u segue aberta depois da saída; volta a medir", pos));
        }
      g_exc[k].sumiu_ms = 0;
      g_exc[k].vol_viva = PositionGetDouble(POSITION_VOLUME);
     }

   for(int i = ArraySize(g_exc) - 1; i >= 0; i--)
     {
      if(g_exc[i].visto) continue;
      if(g_exc[i].sumiu_ms == 0)
        {
         g_exc[i].sumiu_ms = agora;   // o DEAL_ADD pode chegar depois: espera
         continue;
        }
      if(agora - g_exc[i].sumiu_ms < SUMIDA_MS) continue;
      ApagarGv(g_exc[i].posicao_id, g_exc[i].ciclo);
      RemoverExcursao(i);
     }

   // símbolo sem posição nenhuma (viva ou esperando deal): para de ler ticks
   for(int s = 0; s < ArraySize(g_tick_sim); s++)
     {
      if(g_tick_msc[s] == 0) continue;
      bool usado = false;
      for(int i = 0; i < ArraySize(g_exc); i++)
         if(g_exc[i].sim_idx == s) { usado = true; break; }
      if(!usado) g_tick_msc[s] = 0;
     }
  }

// Roda a cada InpAmostraMs. Só memória: nada de rede aqui.
void Medir()
  {
   int dia = DiaServidor();
   if(dia != g_dia)
     {
      // MEP/MEN são do dia; posição que virou a noite continua em g_exc
      bool primeiro = (g_dia == 0);
      ArrayResize(g_exp, 0);
      g_dia = dia;
      if(primeiro) SemearDia();   // EA subiu sem conexão e só agora sabe o dia
      else Log("novo dia no servidor: MEP/MEN zerados");
     }
   SincronizarPosicoes();
   for(int s = 0; s < ArraySize(g_tick_sim); s++)
      LerTicks(s);
   GravarGvSujas();
  }

//+------------------------------------------------------------------+
//| Excursões: init                                                  |
//+------------------------------------------------------------------+
// Posições já abertas quando o EA sobe
void RestaurarExcursoes()
  {
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      ulong pos = (ulong)PositionGetInteger(POSITION_IDENTIFIER);
      if(ProcurarExc(pos) >= 0) continue;
      CriarExcursao(pos, true);
     }
   LimparGvOrfas();
  }

// Saídas de hoje que já aconteceram antes do EA subir entram no realizado do magic, e o dia
// fica marcado como parcial (o caminho tick a tick até aqui não foi visto).
void SemearDia()
  {
   g_dia = DiaServidor();
   if(g_dia == 0)
     {
      Log("sem hora do servidor ainda; semeadura do dia fica pra primeira amostra");
      return;
     }
   datetime ini = (datetime)((long)g_dia * 86400);
   if(!HistorySelect(ini, TimeCurrent() + 86400))
     {
      Log("SemearDia: HistorySelect falhou");
      return;
     }

   // lista antes, porque cada HistorySelectByPosition troca o cache
   ulong saidas[];
   ArrayResize(saidas, 0);
   int n = HistoryDealsTotal();
   for(int k = 0; k < n; k++)
     {
      ulong t = HistoryDealGetTicket(k);
      if(t == 0) continue;
      if((datetime)HistoryDealGetInteger(t, DEAL_TIME) < ini) continue;
      long tipo = HistoryDealGetInteger(t, DEAL_TYPE);
      if(tipo != DEAL_TYPE_BUY && tipo != DEAL_TYPE_SELL) continue;
      if(HistoryDealGetInteger(t, DEAL_ENTRY) == DEAL_ENTRY_IN) continue;
      int m = ArraySize(saidas);
      ArrayResize(saidas, m + 1);
      saidas[m] = t;
     }

   int contadas = 0;
   for(int k = 0; k < ArraySize(saidas); k++)
     {
      ulong t = saidas[k];
      if(!HistoryDealSelect(t)) continue;
      ulong  pos   = (ulong)HistoryDealGetInteger(t, DEAL_POSITION_ID);
      double lucro = HistoryDealGetDouble(t, DEAL_PROFIT);
      double vol   = HistoryDealGetDouble(t, DEAL_VOLUME);
      long   magic = HistoryDealGetInteger(t, DEAL_MAGIC);
      bool   fecha = (HistoryDealGetInteger(t, DEAL_ENTRY) == DEAL_ENTRY_INOUT);
      Excursao e;
      ZerarExcursao(e);
      double vivo = 0;
      if(LerPosicaoDoHistorico(pos, t, e, vivo))
        {
         // vivo = volume aberto ANTES deste deal: a saída fecha o ciclo se zera o que havia
         if(!fecha) fecha = (vivo - vol <= 0.0000001);
         vol   = e.vol_entradas;   // por 1 contrato da posição, como o site
         magic = e.magic;
        }
      else
         fecha = true;             // sem o histórico da posição não dá pra saber: conta
      if(vol <= 0) continue;
      int x = ProcurarExp(magic, true);
      g_exp[x].realizado_pc += lucro / vol;
      if(fecha) g_exp[x].n_saidas++;   // ciclos fechados (operações do site), não deals
      g_exp[x].parcial = true;
      if(t > g_ultimo_deal_contab) g_ultimo_deal_contab = t;
      contadas++;
     }

   // o caminho até aqui é desconhecido: os extremos partem do que se sabe (0 e o realizado)
   for(int x = 0; x < ArraySize(g_exp); x++)
     {
      g_exp[x].mep   = MathMax(0.0, g_exp[x].realizado_pc);
      g_exp[x].men   = MathMin(0.0, g_exp[x].realizado_pc);
      g_exp[x].mep_n = g_exp[x].n_saidas;
      g_exp[x].men_n = g_exp[x].n_saidas;
     }
   // posição restaurada sem medição completa também deixa o dia do magic parcial
   for(int i = 0; i < ArraySize(g_exc); i++)
      if(g_exc[i].parcial)
        {
         int x = ProcurarExp(g_exc[i].magic, true);
         g_exp[x].parcial = true;
        }

   if(contadas > 0 || ArraySize(g_exp) > 0)
      Log(StringFormat("dia %s semeado: %d saídas de hoje em %d magics (parcial)",
                       DiaIso(g_dia), contadas, ArraySize(g_exp)));
  }

//+------------------------------------------------------------------+
//| Excursões: deals                                                 |
//+------------------------------------------------------------------+
// Antes de enviar o deal: entrada cria/atualiza o ciclo; saída/reversão fecha a conta do
// ciclo corrente (preço de saída é o último ponto da excursão; realizado do magic soma).
void DealAntes(ulong ticket)
  {
   ulong  pos   = (ulong)HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
   long   entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
   double v     = HistoryDealGetDouble(ticket, DEAL_VOLUME);
   double preco = HistoryDealGetDouble(ticket, DEAL_PRICE);
   double lucro = HistoryDealGetDouble(ticket, DEAL_PROFIT);
   long   magic = HistoryDealGetInteger(ticket, DEAL_MAGIC);
   long   msc   = HistoryDealGetInteger(ticket, DEAL_TIME_MSC);
   if(pos == 0) return;

   int k = ProcurarExc(pos);
   if(entry == DEAL_ENTRY_IN)
     {
      if(k < 0)
         CriarExcursao(pos, false);
      else
        {
         // entrada adicional: preço médio e volume do ciclo vêm do histórico
         Excursao e;
         ZerarExcursao(e);
         double vivo = 0;
         if(LerPosicaoDoHistorico(pos, 0, e, vivo))
           {
            g_exc[k].preco_abertura = e.preco_abertura;
            g_exc[k].vol_entradas   = e.vol_entradas;
            g_exc[k].vol_viva       = vivo;
           }
        }
      HistoryDealSelect(ticket);   // o HistorySelectByPosition trocou o cache
      return;
     }

   // saída (out, out_by) ou reversão (inout)
   if(k < 0) k = CriarExcursao(pos, true);   // posição que o EA nunca viu: parcial
   double vol_norm    = v;
   bool   fecha_ciclo = true;                // sem excursão não dá pra saber: cada saída conta
   if(k >= 0)
     {
      // Ticks até a saída, com a posição viva, e o preço de saída como último ponto. Rebobina até o
      // último tick aplicado: o Medir() pode ter consumido ticks com a posição já fora do
      // PositionsTotal (ou virada) sem aplicá-los; max/min são idempotentes, reaplicar não custa
      g_exc[k].fim_msc  = msc;
      g_exc[k].sumiu_ms = 0;
      long desde = (g_exc[k].ultimo_msc > 0 ? g_exc[k].ultimo_msc : g_exc[k].abertura_msc);
      RebasearTicks(g_exc[k].sim_idx, desde);
      LerTicks(g_exc[k].sim_idx);
      AplicarPreco(k, preco, msc);
      magic = g_exc[k].magic;
      if(g_exc[k].vol_entradas > 0) vol_norm = g_exc[k].vol_entradas;
      if(entry == DEAL_ENTRY_INOUT)
         g_exc[k].vol_viva = 0;
      else
        {
         // volume vivo pelo histórico (este deal já está lá): o SincronizarPosicoes pode já ter
         // posto o POSITION_VOLUME reduzido em vol_viva, e subtrair de novo fecharia uma saída parcial
         Excursao h;
         ZerarExcursao(h);
         double vivo = 0;
         if(LerPosicaoDoHistorico(pos, 0, h, vivo) && h.ciclo == g_exc[k].ciclo)
            g_exc[k].vol_viva = vivo;
         else
            g_exc[k].vol_viva = MathMax(0.0, g_exc[k].vol_viva - v);
        }
      fecha_ciclo = (g_exc[k].vol_viva <= 0.0000001);
      if(fecha_ciclo)
        {
         g_exc[k].vol_viva = 0;
         g_exc[k].sumiu_ms = GetTickCount64();   // sai do flutuante já; some de vez em SUMIDA_MS
        }
      else
         g_exc[k].fim_msc = 0;                    // saída parcial: continua viva
      if(g_exc[k].gv_sujo) GravarGv(g_exc[k]);
     }

   // realizado do dia por contrato; o extremo é recalculado na hora. n_saidas conta CICLOS fechados
   // (operações do site), não deals: saída parcial em dois deals é uma operação e um custo só
   if(ticket > g_ultimo_deal_contab && vol_norm > 0)
     {
      int x = ProcurarExp(magic, true);
      g_exp[x].realizado_pc += lucro / vol_norm;
      if(fecha_ciclo) g_exp[x].n_saidas++;
      AtualizarExposicao(magic, msc);
     }
   HistoryDealSelect(ticket);
  }

// Troca g_exc[k] pelo ciclo corrente da posição lido do histórico (depois de uma reversão): ciclo
// novo, invertido, medido a partir do preço da reversão. false = o histórico não mostra ciclo novo
// vivo (reversão que zerou, ou o deal ainda não está no cache): g_exc[k] fica como está. Troca o
// cache de histórico: quem chamou reseleciona o que precisar.
bool RecriarCiclo(int k)
  {
   ulong pos = g_exc[k].posicao_id;
   Excursao e;
   ZerarExcursao(e);
   double vivo = 0;
   if(!LerPosicaoDoHistorico(pos, 0, e, vivo) || e.vol_entradas <= 0 || vivo <= 0) return false;
   if(e.ciclo == g_exc[k].ciclo && e.lado == g_exc[k].lado) return false;   // histórico ainda sem a reversão
   ApagarGv(pos, g_exc[k].ciclo);
   e.posicao_id = pos;
   e.vol_viva   = vivo;
   e.sim_idx    = g_exc[k].sim_idx;
   g_exc[k] = e;
   RebasearTicks(e.sim_idx, e.abertura_msc);
   Log(StringFormat("posição %I64u revertida: ciclo %d %s desde %s", pos, e.ciclo,
                    (e.lado == 0 ? "compra" : "venda"), Num(e.preco_abertura, DigitosDe(e.simbolo))));
   return true;
  }

// Depois de enviar o deal: reversão vira o ciclo (o deal já foi com a excursão do ciclo fechado)
void DealDepois(ulong ticket)
  {
   if(HistoryDealGetInteger(ticket, DEAL_ENTRY) != DEAL_ENTRY_INOUT) return;
   ulong pos = (ulong)HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
   int k = ProcurarExc(pos);
   if(k < 0) return;
   RecriarCiclo(k);   // false = reversão que zerou (raro): fica como saída normal
   HistoryDealSelect(ticket);
  }

//+------------------------------------------------------------------+
//| JSON dos objetos                                                 |
//+------------------------------------------------------------------+
// Campos de excursão (começam com vírgula). com_tempos só no deal: o heartbeat fica pequeno.
string ExcursaoJson(int k, bool com_tempos)
  {
   int dig = DigitosDe(g_exc[k].simbolo);
   string s = ",\"ciclo\":"       + IntegerToString(g_exc[k].ciclo) +
              ",\"mfe_pontos\":"  + Num(g_exc[k].mfe, dig) +
              ",\"mae_pontos\":"  + Num(g_exc[k].mae, dig);
   if(com_tempos)
     {
      if(g_exc[k].mfe_msc > 0) s += ",\"mfe_em\":" + IsoUtcMsc(g_exc[k].mfe_msc);
      if(g_exc[k].mae_msc > 0) s += ",\"mae_em\":" + IsoUtcMsc(g_exc[k].mae_msc);
     }
   s += ",\"excursao_parcial\":" + Bool(g_exc[k].parcial);
   return s;
  }

// O deal precisa estar selecionado no histórico (HistoryDealSelect).
// com_excursao só no deal ao vivo: página de histórico nunca leva excursão.
string DealJson(ulong ticket, bool com_excursao = false)
  {
   string simbolo = HistoryDealGetString(ticket, DEAL_SYMBOL);
   LembrarSimbolo(simbolo);
   int dig = DigitosDe(simbolo);
   ulong pos = (ulong)HistoryDealGetInteger(ticket, DEAL_POSITION_ID);

   string s = "{"
              "\"ticket\":"      + IntegerToString((long)ticket) +
              ",\"posicao_id\":" + IntegerToString((long)pos) +
              ",\"ordem\":"      + IntegerToString((long)HistoryDealGetInteger(ticket, DEAL_ORDER)) +
              ",\"simbolo\":"    + JsonStr(simbolo) +
              ",\"tipo\":"       + IntegerToString((long)HistoryDealGetInteger(ticket, DEAL_TYPE)) +
              ",\"entry\":"      + IntegerToString((long)HistoryDealGetInteger(ticket, DEAL_ENTRY)) +
              ",\"volume\":"     + Num(HistoryDealGetDouble(ticket, DEAL_VOLUME), 2) +
              ",\"preco\":"      + Num(HistoryDealGetDouble(ticket, DEAL_PRICE), dig) +
              ",\"lucro\":"      + Num(HistoryDealGetDouble(ticket, DEAL_PROFIT), 2) +
              ",\"comissao\":"   + Num(HistoryDealGetDouble(ticket, DEAL_COMMISSION), 2) +
              ",\"swap\":"       + Num(HistoryDealGetDouble(ticket, DEAL_SWAP), 2) +
              ",\"magic\":"      + IntegerToString((long)HistoryDealGetInteger(ticket, DEAL_MAGIC)) +
              ",\"executado_em\":" + IsoUtcMsc(HistoryDealGetInteger(ticket, DEAL_TIME_MSC)) +
              ",\"comentario\":" + JsonStr(HistoryDealGetString(ticket, DEAL_COMMENT));
   if(com_excursao && pos > 0)
     {
      int k = ProcurarExc(pos);
      if(k >= 0) s += ExcursaoJson(k, true);
     }
   return s + "}";
  }

string PosicoesJson()
  {
   string itens = "";
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      string simbolo = PositionGetString(POSITION_SYMBOL);
      LembrarSimbolo(simbolo);
      int dig = DigitosDe(simbolo);
      long tipo = PositionGetInteger(POSITION_TYPE); // 0 = buy, 1 = sell
      ulong pos = (ulong)PositionGetInteger(POSITION_IDENTIFIER);

      string item = "{"
                    "\"ticket\":"          + IntegerToString((long)ticket) +
                    ",\"simbolo\":"        + JsonStr(simbolo) +
                    ",\"lado\":"           + IntegerToString(tipo) +
                    ",\"magic\":"          + IntegerToString((long)PositionGetInteger(POSITION_MAGIC)) +
                    ",\"volume\":"         + Num(PositionGetDouble(POSITION_VOLUME), 2) +
                    ",\"preco_abertura\":" + Num(PositionGetDouble(POSITION_PRICE_OPEN), dig) +
                    ",\"lucro_flutuante\":" + Num(PositionGetDouble(POSITION_PROFIT), 2) +
                    ",\"aberta_em\":"      + IsoUtcMsc(PositionGetInteger(POSITION_TIME_MSC)) +
                    ",\"posicao_id\":"     + IntegerToString((long)pos);
      if(InpExcursao)
        {
         int k = ProcurarExc(pos);
         if(k >= 0) item += ExcursaoJson(k, false);
        }
      item += "}";
      if(itens != "") itens += ",";
      itens += item;
     }
   return "[" + itens + "]";
  }

string CotacoesJson()
  {
   string itens = "";
   for(int i = 0; i < ArraySize(g_simbolos); i++)
     {
      string s = g_simbolos[i];
      double ultimo = SymbolInfoDouble(s, SYMBOL_LAST);
      if(ultimo <= 0) ultimo = SymbolInfoDouble(s, SYMBOL_BID);
      if(ultimo <= 0) continue;
      double fech = SymbolInfoDouble(s, SYMBOL_SESSION_CLOSE);
      if(fech <= 0) fech = SymbolInfoDouble(s, SYMBOL_SESSION_PRICE_SETTLEMENT);
      int dig = DigitosDe(s);

      string item = "{\"simbolo\":" + JsonStr(s) + ",\"preco\":" + Num(ultimo, dig);
      if(fech > 0) item += ",\"fechamento_anterior\":" + Num(fech, dig);
      item += "}";
      if(itens != "") itens += ",";
      itens += item;
     }
   return "[" + itens + "]";
  }

// MEP/MEN do dia por magic (R$ brutos por contrato). mep_em/men_em só quando saiu do zero.
string ExposicaoJson()
  {
   string itens = "";
   for(int x = 0; x < ArraySize(g_exp); x++)
     {
      if(g_exp[x].dia != g_dia) continue;
      string item = "{"
                    "\"magic\":"        + IntegerToString(g_exp[x].magic) +
                    ",\"dia\":"         + DiaIso(g_exp[x].dia) +
                    ",\"realizado\":"   + Num(g_exp[x].realizado_pc, 4) +
                    ",\"flutuante\":"   + Num(g_exp[x].flut_pc, 4) +
                    ",\"n_saidas\":"    + IntegerToString(g_exp[x].n_saidas) +
                    ",\"mep\":"         + Num(g_exp[x].mep, 4);
      if(g_exp[x].mep_msc > 0) item += ",\"mep_em\":" + IsoUtcMsc(g_exp[x].mep_msc);
      item += ",\"mep_n_saidas\":" + IntegerToString(g_exp[x].mep_n) +
              ",\"men\":"          + Num(g_exp[x].men, 4);
      if(g_exp[x].men_msc > 0) item += ",\"men_em\":" + IsoUtcMsc(g_exp[x].men_msc);
      item += ",\"men_n_saidas\":" + IntegerToString(g_exp[x].men_n) +
              ",\"parcial\":"      + Bool(g_exp[x].parcial) +
              "}";
      if(itens != "") itens += ",";
      itens += item;
     }
   return "[" + itens + "]";
  }

//+------------------------------------------------------------------+
//| Envios                                                           |
//+------------------------------------------------------------------+
void EnviarDeal(ulong ticket)
  {
   if(!HistoryDealSelect(ticket))
     {
      Log(StringFormat("deal %I64u não encontrado no histórico", ticket));
      return;
     }
   string corpo = "{\"ea_versao\":\"" EA_VERSAO "\",\"deal\":" + DealJson(ticket, InpExcursao) + "}";
   string resp;
   if(!Http("POST", "/api/ingest/deal", corpo, resp))
      Enfileirar("/api/ingest/deal", corpo);   // corpo completo, com a excursão, pra não perder o MFE/MAE
   else if(g_http_codigo >= 200 && g_http_codigo < 300)
      Log(StringFormat("deal %I64u enviado", ticket));
   else
      Log(StringFormat("deal %I64u DESCARTADO (HTTP %d): o histórico do próximo init recupera o deal, mas sem MFE/MAE",
                       ticket, g_http_codigo));
  }

void EnviarHeartbeat()
  {
   string corpo = "{"
                  "\"ea_versao\":\"" EA_VERSAO "\""
                  ",\"em\":"       + IsoUtc(TimeCurrent()) +
                  ",\"balance\":"  + Num(AccountInfoDouble(ACCOUNT_BALANCE), 2) +
                  ",\"equity\":"   + Num(AccountInfoDouble(ACCOUNT_EQUITY), 2) +
                  ",\"posicoes\":" + PosicoesJson() +
                  ",\"cotacoes\":" + CotacoesJson();
   if(InpExcursao) corpo += ",\"exposicao_dia\":" + ExposicaoJson();
   corpo += "}";
   string resp;
   if(!Http("POST", "/api/ingest/heartbeat", corpo, resp))
      Log("heartbeat falhou; tenta de novo no próximo timer");
  }

// Monta os últimos N dias em páginas e coloca na fila; o OnTimer envia uma
// página por tick, depois do heartbeat, pra nunca travar o "ao vivo".
void EnfileirarHistorico()
  {
   datetime de  = TimeCurrent() - (datetime)(InpDiasHistorico * 86400);
   datetime ate = TimeCurrent() + 86400;
   if(!HistorySelect(de, ate))
     {
      Log("HistorySelect falhou");
      return;
     }

   int total = HistoryDealsTotal();
   if(total == 0)
     {
      Log("sem deals no período de histórico");
      return;
     }

   int total_paginas = (total + PAGINA_HIST - 1) / PAGINA_HIST;
   int pagina = 0;
   int enviados = 0;

   for(int inicio = 0; inicio < total; inicio += PAGINA_HIST)
     {
      pagina++;
      string itens = "";
      int fim = MathMin(inicio + PAGINA_HIST, total);
      for(int i = inicio; i < fim; i++)
        {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket == 0) continue;
         if(itens != "") itens += ",";
         itens += DealJson(ticket);
        }

      string corpo = "{"
                     "\"ea_versao\":\"" EA_VERSAO "\""
                     ",\"de\":"            + IsoUtc(de) +
                     ",\"ate\":"           + IsoUtc(ate) +
                     ",\"pagina\":"        + IntegerToString(pagina) +
                     ",\"total_paginas\":" + IntegerToString(total_paginas) +
                     ",\"deals\":["        + itens + "]"
                     "}";
      Enfileirar("/api/ingest/history", corpo);
      enviados += (fim - inicio);
     }
   g_reconciliar_pendente = true;
   Log(StringFormat("histórico: %d deals em %d páginas na fila; envio 1 página por timer", enviados, total_paginas));
  }

// Pede ao servidor pra reparear posições sem operação ou marcadas como abertas
void Reconciliar()
  {
   string resp;
   if(Http("POST", "/api/ingest/reconciliar", "{}", resp, InpTimeoutHistMs))
      Log("reconciliação ok: " + StringSubstr(resp, 0, 300));
   else
      Log("reconciliação falhou; roda de novo no próximo init");
  }

bool Ping()
  {
   string resp;
   if(!Http("GET", "/api/ingest/ping", "", resp))
     {
      Log("ping falhou: confira URL, token e a liberação de WebRequest");
      return false;
     }
   Log("ping ok: " + resp);
   return true;
  }

//+------------------------------------------------------------------+
//| Candles M1                                                       |
//+------------------------------------------------------------------+
string CandlesSimbolo()
  {
   return (InpCandlesSimbolo != "" ? InpCandlesSimbolo : Symbol());
  }

// Barras M1 fechadas desde a última aceita, em páginas de CANDLES_PAGINA. Sem fila: falha só
// loga e a próxima tentativa relê as mesmas barras do terminal (o servidor ignora repetida).
void EnviarCandles()
  {
   if(!InpEnviaCandles) return;
   string sim = CandlesSimbolo();
   datetime t0 = iTime(sim, PERIOD_M1, 0);
   if(t0 == 0) return;   // sem dados do símbolo ainda
   if(!g_candle_ok)
     {
      g_candle_ate = t0 - (datetime)(InpCandlesBackfillMin * 60);
      g_candle_ok  = true;
     }
   // só quando fechou barra nova (ou sobrou página do backfill)
   if(t0 == g_candle_t0 && !g_candle_atrasado) return;
   g_candle_t0 = t0;
   g_candle_atrasado = false;

   datetime de  = g_candle_ate + 60;
   datetime ate = t0 - 60;   // a barra 0 ainda está aberta
   if(de > ate) return;

   MqlRates r[];
   int n = CopyRates(sim, PERIOD_M1, de, ate, r);
   if(n <= 0)
     {
      Log(StringFormat("candles: CopyRates(%s) devolveu %d (erro %d); tenta na próxima barra", sim, n, GetLastError()));
      return;
     }
   int enviar = MathMin(n, CANDLES_PAGINA);
   int dig = DigitosDe(sim);
   string itens = "";
   for(int i = 0; i < enviar; i++)
     {
      if(itens != "") itens += ",";
      itens += "{\"t\":" + IsoUtc(r[i].time) +
               ",\"o\":" + Num(r[i].open, dig) +
               ",\"h\":" + Num(r[i].high, dig) +
               ",\"l\":" + Num(r[i].low, dig) +
               ",\"c\":" + Num(r[i].close, dig) +
               ",\"v\":" + IntegerToString(r[i].tick_volume) +
               ",\"vr\":" + IntegerToString(r[i].real_volume) +
               "}";
     }
   string corpo = "{\"ea_versao\":\"" EA_VERSAO "\""
                  ",\"simbolo\":" + JsonStr(sim) +
                  ",\"timeframe\":\"M1\""
                  ",\"candles\":[" + itens + "]}";
   string resp;
   Http("POST", "/api/ingest/candles", corpo, resp);
   if(g_http_codigo >= 200 && g_http_codigo < 300)
     {
      g_candle_ate = r[enviar - 1].time;
      g_candle_atrasado = (n > enviar);   // backfill: próxima página no próximo slot
      if(enviar > 1 || g_candle_atrasado)
         Log(StringFormat("candles: %d barras M1 de %s até %s%s", enviar, sim,
                          TimeToString(g_candle_ate, TIME_DATE | TIME_MINUTES),
                          (g_candle_atrasado ? StringFormat(", faltam %d", n - enviar) : "")));
     }
   else
      Log(StringFormat("candles: envio falhou (%d); as mesmas barras vão de novo na próxima", g_http_codigo));
  }

//+------------------------------------------------------------------+
//| Eventos                                                          |
//+------------------------------------------------------------------+
int OnInit()
  {
   if(InpToken == "")
     {
      Alert("DeltaReporter: preencha o token da conta nos parâmetros.");
      return INIT_PARAMETERS_INCORRECT;
     }
   if(StringLen(InpUrlBase) < 8 || StringFind(InpUrlBase, "http") != 0)
     {
      Alert("DeltaReporter: URL base inválida.");
      return INIT_PARAMETERS_INCORRECT;
     }
   if(InpHeartbeatSeg < 1)
     {
      Alert("DeltaReporter: heartbeat mínimo de 1 segundo.");
      return INIT_PARAMETERS_INCORRECT;
     }
   g_amostra_ms = InpAmostraMs;
   if(g_amostra_ms < 50)   g_amostra_ms = 50;
   if(g_amostra_ms > 1000) g_amostra_ms = 1000;

   ArrayResize(g_simbolos, 0);
   LembrarSimbolo(Symbol());
   if(InpSimbolos != "")
     {
      string partes[];
      int n = StringSplit(InpSimbolos, ',', partes);
      for(int i = 0; i < n; i++)
        {
         string s = partes[i];
         StringTrimLeft(s);
         StringTrimRight(s);
         if(s != "")
           {
            SymbolSelect(s, true);
            LembrarSimbolo(s);
           }
        }
     }

   Log(StringFormat("v%s iniciando. conta %I64d, servidor %s, offset UTC %d s, amostra %d ms, excursão %s, candles %s",
                    EA_VERSAO, AccountInfoInteger(ACCOUNT_LOGIN), AccountInfoString(ACCOUNT_SERVER),
                    (int)OffsetServidorSeg(), g_amostra_ms, (InpExcursao ? "ligada" : "desligada"),
                    (InpEnviaCandles ? CandlesSimbolo() : "desligados")));
   for(int i = 0; i < ArraySize(g_simbolos); i++) LogValorPonto(g_simbolos[i]);

   Ping();

   g_dia        = DiaServidor();
   g_inicio_msc = MscServidor();
   ArrayResize(g_exc, 0);
   ArrayResize(g_exp, 0);
   ArrayResize(g_tick_sim, 0);
   ArrayResize(g_tick_msc, 0);
   ArrayResize(g_tick_vp, 0);
   if(InpExcursao)
     {
      RestaurarExcursoes();   // posições abertas: continua das GV ou marca parcial
      SemearDia();            // saídas de hoje antes do EA subir
     }

   g_candle_ok = false;
   g_candle_t0 = 0;
   g_candle_atrasado = false;
   if(InpEnviaCandles)
     {
      string sim = CandlesSimbolo();
      SymbolSelect(sim, true);
      datetime t0 = iTime(sim, PERIOD_M1, 0);
      if(t0 > 0)
        {
         g_candle_ate = t0 - (datetime)(InpCandlesBackfillMin * 60);
         g_candle_ok  = true;
        }
      Log(StringFormat("candles M1 de %s: backfill de %d min", sim, InpCandlesBackfillMin));
     }

   // timer ANTES do histórico: o ao vivo não espera. Medir() roda a cada amostra;
   // a rede (heartbeat, fila, candles) continua a cada InpHeartbeatSeg.
   EventSetMillisecondTimer(g_amostra_ms);
   if(InpExcursao) Medir();   // primeiro heartbeat já sai com flutuante e MEP/MEN
   EnviarHeartbeat();
   g_ultimo_hb_ms = GetTickCount64();
   EnfileirarHistorico();            // só enfileira; o OnTimer envia 1 página por tick
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   if(InpExcursao) GravarGvSujas(true);   // extremos e "até onde mediu" ficam nas GV pro próximo init
   Log(StringFormat("parando (motivo %d). itens na fila: %d", reason, g_fila_n));
  }

void OnTimer()
  {
   if(InpExcursao) Medir();   // só memória, a cada amostra

   ulong agora = GetTickCount64();
   if(agora - g_ultimo_hb_ms < (ulong)InpHeartbeatSeg * 1000) return;
   g_ultimo_hb_ms = agora;

   // único slot com rede (WebRequest é síncrono)
   EnviarHeartbeat();   // ao vivo primeiro
   ReenviarUm();        // depois, no máximo 1 item da fila (deal ou página de histórico)
   EnviarCandles();     // por último, e só quando fechou barra
  }

// Cada deal novo na conta (qualquer robô, qualquer magic)
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
  {
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;
   if(trans.deal == 0) return;

   // garante o deal no cache de histórico antes de ler
   if(!HistoryDealSelect(trans.deal))
     {
      HistorySelect(TimeCurrent() - 86400, TimeCurrent() + 86400);
      if(!HistoryDealSelect(trans.deal))
        {
         Log(StringFormat("deal %I64u ainda não disponível; vai no histórico do próximo init", trans.deal));
         return;
        }
     }

   long tipo = HistoryDealGetInteger(trans.deal, DEAL_TYPE);
   bool negociacao = (tipo == DEAL_TYPE_BUY || tipo == DEAL_TYPE_SELL);

   if(InpExcursao && negociacao) DealAntes(trans.deal);   // excursão fechada com o preço de saída
   EnviarDeal(trans.deal);                                 // vai com o MFE/MAE do ciclo
   if(InpExcursao && negociacao) DealDepois(trans.deal);  // reversão abre o ciclo seguinte
  }
//+------------------------------------------------------------------+
