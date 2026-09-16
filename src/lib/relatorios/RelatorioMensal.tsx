import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatarBRL, formatarData, formatarHora, formatarMesAno, formatarMultiplo, formatarNumero, formatarPct, formatarPontos, formatarPreco, rotuloLado } from "@/lib/formato";
import { calcularKpis } from "@/lib/stats/kpis";
import type { Faixa, FaixaSimbolo } from "@/lib/stats/operacoes";
import { ordenarPorDia } from "@/lib/stats/serie";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";
import type { OperacaoPublica, RoboPublico } from "@/lib/tipos";

interface Props {
  robo: RoboPublico;
  mes: string;
  ultimoDia: string;
  linhas: LinhaDiaria[];
  /** operações listadas no PDF (pode ser um recorte) */
  ops: OperacaoPublica[];
  /** total de operações do mês */
  totalOps: number;
  porDia: Faixa[];
  porHora: Faixa[];
  porSimbolo: FaixaSimbolo[];
  geradoEm: string;
}

const VERDE = "#2e6f40";
const VERMELHO = "#b22222";
const CINZA = "#71685c";
const LINHA = "#e4e0da";

const s = StyleSheet.create({
  page: { padding: 32, paddingBottom: 44, fontSize: 8.5, fontFamily: "Helvetica", color: "#00162e" },
  cabecalho: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#b38a50" },
  marca: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  titulo: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 2 },
  sub: { fontSize: 9, color: CINZA, marginTop: 2 },
  secao: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  kpi: { width: "23.5%", borderWidth: 1, borderColor: LINHA, borderRadius: 4, padding: 6 },
  kpiRotulo: { fontSize: 7, color: CINZA, marginBottom: 2 },
  kpiValor: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  kpiDetalhe: { fontSize: 7, color: CINZA, marginTop: 1 },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINHA, paddingVertical: 3 },
  cabTabela: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#00162e", paddingVertical: 3, fontFamily: "Helvetica-Bold", color: CINZA, fontSize: 7.5 },
  cel: { paddingHorizontal: 2 },
  dir: { textAlign: "right" },
  rodape: { position: "absolute", left: 32, right: 32, bottom: 18, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: CINZA },
  nota: { fontSize: 7.5, color: CINZA, marginTop: 8, lineHeight: 1.4 },
});

function cor(v: number): string {
  return v > 0 ? VERDE : v < 0 ? VERMELHO : CINZA;
}

function brl(v: number, inteiro = false): string {
  return formatarBRL(v, { sinal: true, inteiro });
}

/** Relatório mensal de um robô, gerado a partir das operações públicas. */
export function RelatorioMensal({ robo, mes, ultimoDia, linhas, ops, totalOps, porDia, porHora, porSimbolo, geradoEm }: Props) {
  const opcoes: OpcoesSerie = { base: "liquido", unidade: "brl", valorPonto: robo.valor_ponto_brl };
  const k = calcularKpis(linhas, opcoes, { hoje: ultimoDia, capitalReferencia: robo.capital_referencia });
  const bruto = linhas.reduce((t, l) => t + l.resultado_brl_por_contrato, 0);
  const custos = linhas.reduce((t, l) => t + l.custos_brl_por_contrato, 0);

  const diarias = ordenarPorDia(linhas).reduce<Array<LinhaDiaria & { liquido: number; acumulado: number }>>((acc, l) => {
    const liquido = l.resultado_brl_por_contrato - l.custos_brl_por_contrato;
    const anterior = acc.length > 0 ? acc[acc.length - 1].acumulado : 0;
    acc.push({ ...l, liquido, acumulado: anterior + liquido });
    return acc;
  }, []);

  const kpis = [
    { rotulo: "Resultado líquido", valor: brl(k.acumulado), cor: cor(k.acumulado), detalhe: "por 1 contrato" },
    { rotulo: "Resultado bruto", valor: brl(bruto), cor: cor(bruto), detalhe: `custos ${formatarBRL(custos)}` },
    { rotulo: "Operações", valor: formatarNumero(k.nOperacoes), detalhe: `${formatarNumero(k.mediaOperacoesDia, 1)} por dia · ${k.nDias} pregões` },
    { rotulo: "Taxa de acerto", valor: formatarPct(k.taxaAcerto), detalhe: `${k.nGain} gain · ${k.nLoss} loss` },
    { rotulo: "Fator de lucro", valor: formatarMultiplo(k.fatorLucro), detalhe: "gains ÷ losses" },
    { rotulo: "Payoff", valor: formatarMultiplo(k.payoff), detalhe: "ganho médio ÷ perda média" },
    { rotulo: "Drawdown do mês", valor: brl(-k.drawdown.valor), cor: VERMELHO, detalhe: k.drawdownMaximoPct !== null ? `${formatarPct(k.drawdownMaximoPct)} do capital` : undefined },
    { rotulo: "Dias positivos × negativos", valor: `${k.diasPositivos} × ${k.diasNegativos}`, detalhe: k.melhorDia && k.piorDia ? `melhor ${brl(k.melhorDia.valor, true)} · pior ${brl(k.piorDia.valor, true)}` : undefined },
  ];

  return (
    <Document title={`${robo.nome} · ${formatarMesAno(`${mes}-01`)}`} author="Delta Robôs" subject="Relatório mensal">
      <Page size="A4" style={s.page}>
        <View style={s.cabecalho}>
          <View>
            <Text style={s.marca}>Delta Robôs · Relatório mensal</Text>
            <Text style={s.titulo}>
              {robo.nome} · {formatarMesAno(`${mes}-01`)}
            </Text>
            <Text style={s.sub}>
              {robo.ativo_nome} ({robo.ativo}) · valores por 1 contrato · custo {formatarBRL(robo.custo_por_contrato)} por contrato por operação
              {robo.conta_tipo === "demo" ? " · conta demo" : ""}
            </Text>
          </View>
          <Text style={s.sub}>gerado em {geradoEm}</Text>
        </View>

        <Text style={s.secao}>Resumo do mês</Text>
        <View style={s.kpis}>
          {kpis.map((item) => (
            <View key={item.rotulo} style={s.kpi}>
              <Text style={s.kpiRotulo}>{item.rotulo}</Text>
              <Text style={[s.kpiValor, { color: item.cor ?? "#00162e" }]}>{item.valor}</Text>
              {item.detalhe ? <Text style={s.kpiDetalhe}>{item.detalhe}</Text> : null}
            </View>
          ))}
        </View>

        <Text style={s.secao}>Resultado por dia</Text>
        <View style={s.cabTabela} fixed>
          <Text style={[s.cel, { width: "14%" }]}>Dia</Text>
          <Text style={[s.cel, s.dir, { width: "10%" }]}>Op.</Text>
          <Text style={[s.cel, s.dir, { width: "10%" }]}>Gain</Text>
          <Text style={[s.cel, s.dir, { width: "10%" }]}>Loss</Text>
          <Text style={[s.cel, s.dir, { width: "14%" }]}>Bruto</Text>
          <Text style={[s.cel, s.dir, { width: "12%" }]}>Custos</Text>
          <Text style={[s.cel, s.dir, { width: "15%" }]}>Líquido</Text>
          <Text style={[s.cel, s.dir, { width: "15%" }]}>Acumulado</Text>
        </View>
        {diarias.map((d) => (
          <View key={d.dia} style={s.linha} wrap={false}>
            <Text style={[s.cel, { width: "14%" }]}>{formatarData(d.dia)}</Text>
            <Text style={[s.cel, s.dir, { width: "10%" }]}>{d.n_operacoes}</Text>
            <Text style={[s.cel, s.dir, { width: "10%" }]}>{d.n_gain}</Text>
            <Text style={[s.cel, s.dir, { width: "10%" }]}>{d.n_loss}</Text>
            <Text style={[s.cel, s.dir, { width: "14%" }]}>{brl(d.resultado_brl_por_contrato)}</Text>
            <Text style={[s.cel, s.dir, { width: "12%" }]}>{formatarBRL(d.custos_brl_por_contrato)}</Text>
            <Text style={[s.cel, s.dir, { width: "15%", color: cor(d.liquido) }]}>{brl(d.liquido)}</Text>
            <Text style={[s.cel, s.dir, { width: "15%", color: cor(d.acumulado) }]}>{brl(d.acumulado)}</Text>
          </View>
        ))}

        {porSimbolo.length > 0 ? (
          <>
            <Text style={s.secao}>Por série do contrato</Text>
            {porSimbolo.map((v) => (
              <View key={v.simbolo} style={s.linha} wrap={false}>
                <Text style={[s.cel, { width: "30%" }]}>{v.simbolo}</Text>
                <Text style={[s.cel, s.dir, { width: "20%" }]}>{v.n} op.</Text>
                <Text style={[s.cel, s.dir, { width: "20%" }]}>{v.n > 0 ? formatarPct(v.nGain / v.n, 0) : "–"} acerto</Text>
                <Text style={[s.cel, s.dir, { width: "30%", color: cor(v.total) }]}>{brl(v.total)}</Text>
              </View>
            ))}
          </>
        ) : null}

        {porDia.length > 0 ? (
          <>
            <Text style={s.secao}>Por dia da semana e por hora de entrada</Text>
            <View style={{ flexDirection: "row", gap: 16 }}>
              <View style={{ width: "48%" }}>
                {porDia.map((f) => (
                  <View key={f.chave} style={s.linha} wrap={false}>
                    <Text style={[s.cel, { width: "30%" }]}>{f.rotulo}</Text>
                    <Text style={[s.cel, s.dir, { width: "20%" }]}>{f.n} op.</Text>
                    <Text style={[s.cel, s.dir, { width: "20%" }]}>{f.n > 0 ? formatarPct(f.nGain / f.n, 0) : "–"}</Text>
                    <Text style={[s.cel, s.dir, { width: "30%", color: cor(f.total) }]}>{brl(f.total)}</Text>
                  </View>
                ))}
              </View>
              <View style={{ width: "48%" }}>
                {porHora.map((f) => (
                  <View key={f.chave} style={s.linha} wrap={false}>
                    <Text style={[s.cel, { width: "30%" }]}>{f.rotulo}</Text>
                    <Text style={[s.cel, s.dir, { width: "20%" }]}>{f.n} op.</Text>
                    <Text style={[s.cel, s.dir, { width: "20%" }]}>{f.n > 0 ? formatarPct(f.nGain / f.n, 0) : "–"}</Text>
                    <Text style={[s.cel, s.dir, { width: "30%", color: cor(f.total) }]}>{brl(f.total)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : null}

        <Text style={s.nota}>
          Resultado bruto é o do MetaTrader; líquido desconta o custo por contrato do robô. Gain e loss são classificados pelo líquido.
          Drawdown é a maior distância da curva acumulada do mês até o pico anterior. Metodologia completa em deltarobos-mu.vercel.app/metodologia.
        </Text>

        <View style={s.rodape} fixed>
          <Text>Delta Robôs · {robo.nome} · {formatarMesAno(`${mes}-01`)}</Text>
          <Text render={({ pageNumber, totalPages }) => `página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.secao}>Operações do mês ({formatarNumero(totalOps)})</Text>
        {totalOps > ops.length ? (
          <Text style={[s.nota, { marginTop: 0, marginBottom: 6 }]}>
            Lista com as primeiras {formatarNumero(ops.length)} operações do mês. As {formatarNumero(totalOps)} completas estão no CSV
            do mesmo mês, na aba Relatórios do robô.
          </Text>
        ) : null}
        <View style={s.cabTabela} fixed>
          <Text style={[s.cel, { width: "10%" }]}>Dia</Text>
          <Text style={[s.cel, { width: "8%" }]}>Abert.</Text>
          <Text style={[s.cel, { width: "8%" }]}>Fech.</Text>
          <Text style={[s.cel, { width: "12%" }]}>Símbolo</Text>
          <Text style={[s.cel, { width: "10%" }]}>Lado</Text>
          <Text style={[s.cel, s.dir, { width: "12%" }]}>Entrada</Text>
          <Text style={[s.cel, s.dir, { width: "12%" }]}>Saída</Text>
          <Text style={[s.cel, s.dir, { width: "9%" }]}>Pontos</Text>
          <Text style={[s.cel, s.dir, { width: "9%" }]}>Bruto</Text>
          <Text style={[s.cel, s.dir, { width: "10%" }]}>Líquido</Text>
        </View>
        {ops.map((o) => {
          const liq = o.resultado_brl_por_contrato - o.custos_brl_por_contrato;
          return (
            <View key={o.id} style={s.linha} wrap={false}>
              <Text style={[s.cel, { width: "10%" }]}>{formatarData(o.dia_pregao).slice(0, 5)}</Text>
              <Text style={[s.cel, { width: "8%" }]}>{o.origem === "manual" ? "–" : formatarHora(o.abertura_em)}</Text>
              <Text style={[s.cel, { width: "8%" }]}>{formatarHora(o.fechamento_em)}</Text>
              <Text style={[s.cel, { width: "12%" }]}>{o.simbolo}</Text>
              <Text style={[s.cel, { width: "10%" }]}>{rotuloLado(o.lado)}</Text>
              <Text style={[s.cel, s.dir, { width: "12%" }]}>{formatarPreco(o.preco_entrada)}</Text>
              <Text style={[s.cel, s.dir, { width: "12%" }]}>{formatarPreco(o.preco_saida)}</Text>
              <Text style={[s.cel, s.dir, { width: "9%" }]}>{formatarPontos(o.pontos_por_contrato, true)}</Text>
              <Text style={[s.cel, s.dir, { width: "9%" }]}>{brl(o.resultado_brl_por_contrato)}</Text>
              <Text style={[s.cel, s.dir, { width: "10%", color: cor(liq) }]}>{brl(liq)}</Text>
            </View>
          );
        })}
        <View style={s.rodape} fixed>
          <Text>Delta Robôs · {robo.nome} · {formatarMesAno(`${mes}-01`)}</Text>
          <Text render={({ pageNumber, totalPages }) => `página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
