"""
Importa operações exportadas do Profit (Nelogica) para o Quants Robôs
(public.operacoes, origem 'manual').

Formatos aceitos, detectados pelo cabeçalho do CSV:
  - operacoes: aba "Gráficos & Operações" do Relatório de Performance (menu Negociação),
    uma linha por operação: Ativo, Abertura, Fechamento, Qtd, Preço de compra,
    Preço de venda, Res Operação, Comissões...
  - ordens: "Exportar Lista de Ordens CSV" (menu Negociação > Lista de Ordens), uma linha
    por ordem. Usa só as executadas (Lado, Ativo, Qtd Executada, Preço Médio, Última
    Atualização ou Criação, ID) e casa entradas e saídas por ativo no modelo netting:
    posição volta a zero = operação fechada.

Uso (na pasta do projeto, com a CLI do Supabase logada e linkada):
    python scripts/importar-profit.py arquivo.csv --slug apollo --dry-run
    python scripts/importar-profit.py arquivo.csv --slug apollo
    python scripts/importar-profit.py arquivo.csv --slug apollo --substituir
    python scripts/importar-profit.py arquivo.csv --slug apollo --lado compra   # se o arquivo não traz o lado

Regras:
- Datas do Profit são horário de Brasília -> timestamptz -03:00. dia_pregao = data do fechamento.
- Pontos = preço de venda - preço de compra (vale para compra e para venda). Resultado bruto =
  coluna do Profit quando existe; senão pontos x valor do ponto x quantidade.
- Normalização por contrato = ÷ quantidade da operação.
- Custos = custo_por_contrato do robô x contratos. A coluna Comissões do Profit é ignorada
  para manter a mesma regra do MT5.
- Idempotente: id_externo = id da ordem ou hash dos campos, único por robô. Repetir a carga
  atualiza os valores; --substituir apaga antes o manual dos dias presentes no arquivo.
- No dia em que existe importação, o site mostra só ela (migration 0014).
"""

import argparse
import csv
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
from datetime import datetime

LOTE_INSERT = 500
FUSO = "-03:00"


# ----------------------------------------------------------------------------- banco
def consultar(sql: str) -> list[dict]:
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as f:
        f.write(sql)
        caminho = f.name
    try:
        cmd = ["npx", "supabase", "db", "query", "--linked", "--file", caminho]
        saida = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", shell=(os.name == "nt")).stdout
    finally:
        os.unlink(caminho)
    inicio = saida.find("{")
    if inicio < 0:
        raise SystemExit(f"resposta sem JSON:\n{saida[:500]}")
    dados = json.loads(saida[inicio:])
    if dados.get("_tag") == "Error":
        raise SystemExit(json.dumps(dados, ensure_ascii=False)[:800])
    return dados.get("rows", [])


def sql_str(v) -> str:
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


# ----------------------------------------------------------------------------- leitura
def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return " ".join(s.lower().replace(".", " ").replace("_", " ").split())


def ler_csv(caminho: str) -> tuple[list[str], list[dict]]:
    bruto = open(caminho, "rb").read()
    texto = None
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            texto = bruto.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if texto is None:
        raise SystemExit("não consegui decodificar o arquivo")
    primeira = texto.splitlines()[0] if texto else ""
    sep = max([";", ",", "\t"], key=primeira.count)
    linhas = list(csv.reader(io.StringIO(texto), delimiter=sep))
    linhas = [l for l in linhas if any(c.strip() for c in l)]
    if not linhas:
        raise SystemExit("arquivo vazio")
    cabecalho = [c.strip() for c in linhas[0]]
    registros = []
    for l in linhas[1:]:
        if len(l) < len(cabecalho):
            l = l + [""] * (len(cabecalho) - len(l))
        registros.append({norm(cabecalho[i]): l[i].strip() for i in range(len(cabecalho))})
    return cabecalho, registros


def achar(chaves: list[str], *candidatos: str, proibidos: tuple[str, ...] = ()) -> str | None:
    """Primeira coluna cujo nome normalizado começa por (ou é igual a) um candidato."""
    for c in candidatos:
        for k in chaves:
            if (k == c or k.startswith(c)) and not any(p in k for p in proibidos):
                return k
    return None


def numero(v: str) -> float | None:
    if v is None:
        return None
    s = str(v).strip().replace("R$", "").replace("−", "-").replace(" ", "")
    if s in ("", "-", "--"):
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"-?\d{1,3}(\.\d{3})+", s):
        s = s.replace(".", "")  # 138.250 em pt-BR é 138250, não 138,25
    try:
        return float(s)
    except ValueError:
        return None


def quando(v: str) -> datetime | None:
    s = (v or "").strip()
    if not s:
        return None
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y"):
        try:
            return datetime.strptime(s[: len(datetime.now().strftime(fmt))], fmt)
        except ValueError:
            continue
    return None


def lado_de(v: str) -> str | None:
    s = norm(v)
    if s.startswith("c") or s.startswith("buy") or s == "compra":
        return "compra"
    if s.startswith("v") or s.startswith("sell") or s == "venda":
        return "venda"
    return None


# ----------------------------------------------------------------------------- formatos
def ops_do_relatorio(chaves, registros, lado_padrao):
    c_ativo = achar(chaves, "ativo")
    c_abre = achar(chaves, "abertura")
    c_fecha = achar(chaves, "fechamento")
    c_qtd = achar(chaves, "qtd", "quantidade")
    c_compra = achar(chaves, "preco de compra", "preco compra", "compra")
    c_venda = achar(chaves, "preco de venda", "preco venda", "venda")
    c_res = achar(chaves, "res operacao", "resultado operacao", "res op", "resultado", proibidos=("%", "intervalo", "liq"))
    c_lado = achar(chaves, "lado", "c/v", "tipo")
    faltam = [n for n, c in (("Ativo", c_ativo), ("Abertura", c_abre), ("Fechamento", c_fecha), ("Qtd", c_qtd)) if not c]
    if faltam:
        raise SystemExit(f"formato operacoes sem as colunas {faltam}. Cabeçalho: {chaves}")
    print("colunas:", {"ativo": c_ativo, "abertura": c_abre, "fechamento": c_fecha, "qtd": c_qtd, "compra": c_compra, "venda": c_venda, "resultado": c_res, "lado": c_lado})

    ops = []
    for r in registros:
        abre, fecha = quando(r[c_abre]), quando(r[c_fecha])
        if not abre or not fecha:
            continue  # operação em andamento ou linha de total
        qtd = numero(r[c_qtd]) or 0
        if qtd <= 0:
            continue
        lado = (lado_de(r[c_lado]) if c_lado else None) or lado_padrao
        if not lado:
            raise SystemExit("o arquivo não traz o lado da operação; passe --lado compra ou --lado venda")
        pc = numero(r[c_compra]) if c_compra else None
        pv = numero(r[c_venda]) if c_venda else None
        res = numero(r[c_res]) if c_res else None
        chave = "|".join([r[c_ativo], r[c_abre], r[c_fecha], r[c_qtd], r[c_compra] if c_compra else "", r[c_venda] if c_venda else ""])
        ops.append({
            "simbolo": r[c_ativo].upper(), "lado": lado, "contratos": qtd,
            "abertura": abre, "fechamento": fecha,
            "preco_entrada": pc if lado == "compra" else pv, "preco_saida": pv if lado == "compra" else pc,
            "pontos": (pv - pc) if (pc is not None and pv is not None) else None,
            "bruto": res, "id_externo": "profit:" + hashlib.sha1(chave.encode()).hexdigest()[:20],
        })
    return ops


def ops_das_ordens(chaves, registros, _lado_padrao):
    c_status = achar(chaves, "status")
    c_lado = achar(chaves, "lado", "side")
    c_ativo = achar(chaves, "ativo", "symbol")
    c_qtd = achar(chaves, "qtd executada", "qtd exec", "quantidade executada", "cumqtd", "qtd")
    c_preco = achar(chaves, "preco medio", "avgprice", "preco")
    c_quando = achar(chaves, "ultima atualizacao", "atualizacao", "data", "criacao")
    c_id = achar(chaves, "clordid", "id", "orderid", "ordem")
    faltam = [n for n, c in (("Lado", c_lado), ("Ativo", c_ativo), ("Qtd", c_qtd), ("Preço", c_preco), ("Data", c_quando)) if not c]
    if faltam:
        raise SystemExit(f"formato ordens sem as colunas {faltam}. Cabeçalho: {chaves}")
    print("colunas:", {"status": c_status, "lado": c_lado, "ativo": c_ativo, "qtd": c_qtd, "preco": c_preco, "quando": c_quando, "id": c_id})

    fills = []
    for r in registros:
        if c_status and not any(t in norm(r[c_status]) for t in ("execut", "finaliz", "filled")):
            continue
        qtd, preco, t = numero(r[c_qtd]) or 0, numero(r[c_preco]), quando(r[c_quando])
        lado = lado_de(r[c_lado])
        if qtd <= 0 or preco is None or not t or not lado:
            continue
        fills.append({"t": t, "simbolo": r[c_ativo].upper(), "q": qtd if lado == "compra" else -qtd, "p": preco, "id": r[c_id] if c_id else ""})
    fills.sort(key=lambda f: f["t"])

    ops, estado = [], {}
    for f in fills:
        e = estado.setdefault(f["simbolo"], {"pos": 0.0, "ent_q": 0.0, "ent_pq": 0.0, "sai_q": 0.0, "sai_pq": 0.0, "abre": None, "ids": []})
        restante = f["q"]
        while abs(restante) > 1e-9:
            if e["pos"] == 0 or (e["pos"] > 0) == (restante > 0):
                q = abs(restante)
                if e["pos"] == 0:
                    e["abre"] = f["t"]
                e["ent_q"] += q
                e["ent_pq"] += q * f["p"]
                e["pos"] += restante
                e["ids"].append(f["id"])
                restante = 0
            else:
                q = min(abs(restante), abs(e["pos"]))
                e["sai_q"] += q
                e["sai_pq"] += q * f["p"]
                e["ids"].append(f["id"])
                lado_ciclo = "compra" if e["pos"] > 0 else "venda"
                e["pos"] += q if restante > 0 else -q
                restante += q if restante < 0 else -q
                if abs(e["pos"]) < 1e-9:
                    pe, ps = e["ent_pq"] / e["ent_q"], e["sai_pq"] / e["sai_q"]
                    pontos = (ps - pe) if lado_ciclo == "compra" else (pe - ps)
                    chave = "|".join([f["simbolo"], e["abre"].isoformat(), f["t"].isoformat(), str(e["ent_q"])] + e["ids"])
                    ops.append({
                        "simbolo": f["simbolo"], "lado": lado_ciclo, "contratos": e["ent_q"],
                        "abertura": e["abre"], "fechamento": f["t"], "preco_entrada": pe, "preco_saida": ps,
                        "pontos": pontos, "bruto": None,
                        "id_externo": "profit:" + hashlib.sha1(chave.encode()).hexdigest()[:20],
                    })
                    e.update({"pos": 0.0, "ent_q": 0.0, "ent_pq": 0.0, "sai_q": 0.0, "sai_pq": 0.0, "abre": None, "ids": []})
    abertas = {s: e["pos"] for s, e in estado.items() if abs(e["pos"]) > 1e-9}
    if abertas:
        print("atenção: posição ainda aberta no fim do arquivo (não importada):", abertas)
    return ops


# ----------------------------------------------------------------------------- carga
def importar(caminho, slug, dry_run, substituir, lado_padrao, formato):
    cabecalho, registros = ler_csv(caminho)
    chaves = [norm(c) for c in cabecalho]
    if formato == "auto":
        formato = "operacoes" if achar(chaves, "abertura") and achar(chaves, "fechamento") else "ordens"
    print(f"arquivo: {caminho} | {len(registros)} linhas | formato {formato}")
    ops = (ops_do_relatorio if formato == "operacoes" else ops_das_ordens)(chaves, registros, lado_padrao)
    if not ops:
        raise SystemExit("nenhuma operação fechada encontrada")

    robo = consultar(f"select id, conta_principal_id, custo_por_contrato from robos where slug = {sql_str(slug)}")
    if not robo:
        raise SystemExit(f"robô {slug} não existe")
    r = robo[0]
    valor_ponto = {m["prefixo_simbolo"]: float(m["valor_ponto_brl"]) for m in consultar("select prefixo_simbolo, valor_ponto_brl from multiplicadores")}
    custo_ct = float(r["custo_por_contrato"] or 0)

    linhas, por_dia = [], {}
    for o in ops:
        prefixo = next((p for p in sorted(valor_ponto, key=len, reverse=True) if o["simbolo"].startswith(p)), None)
        if prefixo is None:
            print("símbolo sem multiplicador, pulando:", o["simbolo"])
            continue
        qtd = o["contratos"]
        pontos = o["pontos"] if o["pontos"] is not None else (o["bruto"] / valor_ponto[prefixo] / qtd if o["bruto"] is not None else None)
        if pontos is None:
            raise SystemExit(f"operação sem pontos nem resultado: {o}")
        bruto = o["bruto"] if o["bruto"] is not None else pontos * valor_ponto[prefixo] * qtd
        calculado = pontos * valor_ponto[prefixo] * qtd
        if o["bruto"] is not None and abs(calculado - bruto) > max(1.0, abs(bruto) * 0.02):
            print(f"aviso: resultado do Profit {bruto:.2f} difere do calculado {calculado:.2f} em {o['simbolo']} {o['fechamento']}")
        dia = o["fechamento"].strftime("%Y-%m-%d")
        d = por_dia.setdefault(dia, {"n": 0, "bruto": 0.0})
        d["n"] += 1
        d["bruto"] += bruto
        abre, fecha = o["abertura"].strftime("%Y-%m-%d %H:%M:%S") + FUSO, o["fechamento"].strftime("%Y-%m-%d %H:%M:%S") + FUSO
        conta = sql_str(r["conta_principal_id"]) + "::uuid" if r["conta_principal_id"] else "null::uuid"
        pe = f"{o['preco_entrada']:.3f}" if o["preco_entrada"] is not None else "null"
        ps = f"{o['preco_saida']:.3f}" if o["preco_saida"] is not None else "null"
        linhas.append("(" + ", ".join([
            sql_str(r["id"]) + "::uuid", conta, sql_str(o["simbolo"]), sql_str(prefixo), sql_str(o["lado"]) + "::lado_operacao",
            f"{qtd:g}", pe, ps, sql_str(abre) + "::timestamptz", sql_str(fecha) + "::timestamptz",
            str(int((o["fechamento"] - o["abertura"]).total_seconds())),
            f"{pontos * qtd:.3f}", f"{pontos:.3f}", f"{bruto:.2f}", f"{bruto / qtd:.4f}",
            f"{custo_ct * qtd:.2f}", f"{custo_ct:.4f}", sql_str(dia) + "::date", sql_str(o["id_externo"]),
            "'manual'::origem_operacao", "1",
        ]) + ")")

    print("por dia:", {d: {"n": v["n"], "bruto": round(v["bruto"], 2)} for d, v in sorted(por_dia.items())})
    print("total:", len(linhas), "operações, bruto", round(sum(v["bruto"] for v in por_dia.values()), 2))
    dias_sql = ", ".join(sql_str(d) + "::date" for d in por_dia)
    mt5 = consultar(f"select dia_pregao, count(*) as n, round(sum(resultado_brl),2) as bruto from operacoes where robo_id = {sql_str(r['id'])}::uuid and origem = 'mt5' and dia_pregao in ({dias_sql}) group by 1 order by 1")
    if mt5:
        print("MT5 nesses dias (ficará oculto no site, substituído pela importação):", mt5)
    if dry_run:
        print("dry-run: nada gravado")
        return

    if substituir:
        consultar(f"delete from operacoes where robo_id = {sql_str(r['id'])}::uuid and origem = 'manual' and dia_pregao in ({dias_sql})")
        print("manual anterior desses dias apagado")

    colunas = ("robo_id, conta_id, simbolo, prefixo_simbolo, lado, contratos, preco_entrada, preco_saida, abertura_em, fechamento_em, "
               "duracao_seg, pontos, pontos_por_contrato, resultado_brl, resultado_brl_por_contrato, custos_brl, custos_brl_por_contrato, "
               "dia_pregao, id_externo, origem, ciclo")
    atualiza = ", ".join(f"{c} = excluded.{c}" for c in ("contratos", "preco_entrada", "preco_saida", "abertura_em", "fechamento_em", "duracao_seg",
                                                        "pontos", "pontos_por_contrato", "resultado_brl", "resultado_brl_por_contrato", "custos_brl",
                                                        "custos_brl_por_contrato", "dia_pregao", "lado", "simbolo"))
    for i in range(0, len(linhas), LOTE_INSERT):
        consultar(f"insert into operacoes ({colunas}) values\n" + ",\n".join(linhas[i:i + LOTE_INSERT])
                  + f"\non conflict (robo_id, id_externo) where id_externo is not null do update set {atualiza}")
        print(f"gravadas {min(i + LOTE_INSERT, len(linhas))}/{len(linhas)}", flush=True)

    print("site agora:", consultar(
        f"select dia_pregao, origem, count(*) as n, round(sum(resultado_brl_por_contrato),2) as bruto_por_contrato from operacoes_publico "
        f"where slug = {sql_str(slug)} and dia_pregao in ({dias_sql}) group by 1,2 order by 1,2"))


def main() -> None:
    p = argparse.ArgumentParser(description="Importa CSV do Profit para operacoes (origem manual)")
    p.add_argument("arquivo")
    p.add_argument("--slug", required=True, help="slug do robô no Quants Robôs")
    p.add_argument("--formato", choices=("auto", "operacoes", "ordens"), default="auto")
    p.add_argument("--lado", choices=("compra", "venda"), help="lado padrão quando o arquivo não informa")
    p.add_argument("--substituir", action="store_true", help="apaga o manual dos dias do arquivo antes de gravar")
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args()
    importar(a.arquivo, a.slug, a.dry_run, a.substituir, a.lado, a.formato)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
