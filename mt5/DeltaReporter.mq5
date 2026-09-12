//+------------------------------------------------------------------+
//|                                                DeltaReporter.mq5 |
//|                                     Coletor da Delta Robôs (MT5) |
//|                                                                  |
//|  SÓ LÊ. Não abre, não fecha, não modifica ordem nenhuma.         |
//|  Roda num gráfico próprio em cada terminal da matriz e envia:    |
//|    - cada deal fechado           -> POST /api/ingest/deal        |
//|    - balance/equity/posições/    -> POST /api/ingest/heartbeat   |
//|      cotações a cada N segundos                                  |
//|    - últimos N dias no init      -> POST /api/ingest/history     |
//|                                                                  |
//|  Configuração no MT5: Ferramentas > Opções > Expert Advisors >   |
//|  "Permitir WebRequest para as URLs listadas" e adicionar a URL.  |
//+------------------------------------------------------------------+
#property copyright   "Delta Robôs"
#property version     "1.00"
#property description "Envia deals, posições e heartbeat da conta para o site da Delta Robôs. Não opera."
#property strict

//--- inputs
input string InpUrlBase       = "https://SEU-DOMINIO.com.br"; // URL base da API (sem barra no final)
input string InpToken         = "";                           // Token da conta (gerado no banco/admin)
input int    InpHeartbeatSeg  = 3;                            // Intervalo do heartbeat (segundos)
input int    InpDiasHistorico = 7;                            // Dias de histórico reenviados no init
input int    InpTimeoutMs     = 3000;                         // Timeout HTTP (ms)
input string InpSimbolos      = "";                           // Símbolos extras pra cotação (ex.: WINV26,WDOV26)
input bool   InpLog           = true;                         // Log na aba Especialistas

#define EA_VERSAO   "1.0.0"
#define FILA_MAX    500
#define PAGINA_HIST 500

//--- fila de reenvio (só deals; heartbeat velho não tem valor)
string g_fila_caminho[];
string g_fila_corpo[];
int    g_fila_n = 0;

//--- símbolos vistos (posições + deals + gráfico + extras) pra cotação
string g_simbolos[];

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

// Diferença (segundos) entre o relógio do servidor e o UTC
long OffsetServidorSeg()
  {
   return (long)(TimeTradeServer() - TimeGMT());
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

//+------------------------------------------------------------------+
//| HTTP                                                             |
//+------------------------------------------------------------------+
// Devolve true se a API respondeu 2xx. Em -1 explica a liberação de URL.
bool Http(string metodo, string caminho, string corpo, string &resposta)
  {
   string url = InpUrlBase + caminho;
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
   int codigo = WebRequest(metodo, url, cabecalhos, InpTimeoutMs, dados, resultado, cabecalhos_resp);

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

   Log(StringFormat("HTTP %d em %s %s: %s", codigo, metodo, caminho, StringSubstr(resposta, 0, 300)));
   // 401/400/429: reenviar não resolve; trata como "entregue" pra não travar a fila
   return (codigo == 400 || codigo == 401 || codigo == 429);
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

// Tenta esvaziar a fila em ordem; para na primeira falha
void Reenviar()
  {
   while(g_fila_n > 0)
     {
      string resp;
      if(!Http("POST", g_fila_caminho[0], g_fila_corpo[0], resp)) return;
      for(int i = 1; i < g_fila_n; i++)
        {
         g_fila_caminho[i - 1] = g_fila_caminho[i];
         g_fila_corpo[i - 1]   = g_fila_corpo[i];
        }
      g_fila_n--;
      ArrayResize(g_fila_caminho, g_fila_n);
      ArrayResize(g_fila_corpo, g_fila_n);
     }
  }

//+------------------------------------------------------------------+
//| JSON dos objetos                                                 |
//+------------------------------------------------------------------+
// O deal precisa estar selecionado no histórico (HistoryDealSelect)
string DealJson(ulong ticket)
  {
   string simbolo = HistoryDealGetString(ticket, DEAL_SYMBOL);
   LembrarSimbolo(simbolo);
   int dig = DigitosDe(simbolo);

   return "{"
          "\"ticket\":"      + IntegerToString((long)ticket) +
          ",\"posicao_id\":" + IntegerToString((long)HistoryDealGetInteger(ticket, DEAL_POSITION_ID)) +
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
          ",\"comentario\":" + JsonStr(HistoryDealGetString(ticket, DEAL_COMMENT)) +
          "}";
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

      string item = "{"
                    "\"ticket\":"          + IntegerToString((long)ticket) +
                    ",\"simbolo\":"        + JsonStr(simbolo) +
                    ",\"lado\":"           + IntegerToString(tipo) +
                    ",\"magic\":"          + IntegerToString((long)PositionGetInteger(POSITION_MAGIC)) +
                    ",\"volume\":"         + Num(PositionGetDouble(POSITION_VOLUME), 2) +
                    ",\"preco_abertura\":" + Num(PositionGetDouble(POSITION_PRICE_OPEN), dig) +
                    ",\"lucro_flutuante\":" + Num(PositionGetDouble(POSITION_PROFIT), 2) +
                    ",\"aberta_em\":"      + IsoUtcMsc(PositionGetInteger(POSITION_TIME_MSC)) +
                    "}";
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
   string corpo = "{\"ea_versao\":\"" EA_VERSAO "\",\"deal\":" + DealJson(ticket) + "}";
   string resp;
   if(!Http("POST", "/api/ingest/deal", corpo, resp))
      Enfileirar("/api/ingest/deal", corpo);
   else
      Log(StringFormat("deal %I64u enviado", ticket));
  }

void EnviarHeartbeat()
  {
   string corpo = "{"
                  "\"ea_versao\":\"" EA_VERSAO "\""
                  ",\"em\":"       + IsoUtc(TimeCurrent()) +
                  ",\"balance\":"  + Num(AccountInfoDouble(ACCOUNT_BALANCE), 2) +
                  ",\"equity\":"   + Num(AccountInfoDouble(ACCOUNT_EQUITY), 2) +
                  ",\"posicoes\":" + PosicoesJson() +
                  ",\"cotacoes\":" + CotacoesJson() +
                  "}";
   string resp;
   if(!Http("POST", "/api/ingest/heartbeat", corpo, resp))
      Log("heartbeat falhou; tenta de novo no próximo timer");
  }

// Reenvia os últimos N dias em páginas de até 500 deals
void EnviarHistorico()
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
      string resp;
      if(Http("POST", "/api/ingest/history", corpo, resp))
         enviados += (fim - inicio);
      else
         Enfileirar("/api/ingest/history", corpo);
     }
   Log(StringFormat("histórico: %d de %d deals enviados (%d páginas)", enviados, total, total_paginas));
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

   Log(StringFormat("v%s iniciando. conta %I64d, servidor %s, offset UTC %d s",
                    EA_VERSAO, AccountInfoInteger(ACCOUNT_LOGIN), AccountInfoString(ACCOUNT_SERVER),
                    (int)OffsetServidorSeg()));

   Ping();
   EnviarHistorico();
   EnviarHeartbeat();

   EventSetTimer(InpHeartbeatSeg);
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   Log(StringFormat("parando (motivo %d). itens na fila: %d", reason, g_fila_n));
  }

void OnTimer()
  {
   Reenviar();
   EnviarHeartbeat();
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

   EnviarDeal(trans.deal);
  }
//+------------------------------------------------------------------+
