"use client";

import { Download, Link2, Share2, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { DIMENSOES_CARD, FORMATOS_CARD, nomeDoArquivo, urlDoCard, type FormatoCard } from "@/components/compartilhar/url-do-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatarDataLonga } from "@/lib/formato";
import {
  AVISO_LINK_COPIADO,
  AVISO_SEM_COMPARTILHAR,
  dicaDoFormato,
  ehCancelamentoDoCompartilhar,
  mensagemDoErroDaPrevia,
  podeCompartilharArquivos,
  proporcaoDoFormato,
  rotuloAcessivelDoBotao,
  textoAlternativoDoCard,
  textosDoCompartilhamento,
} from "./regras-do-compartilhar";

export interface PropsCompartilharDia {
  slug: string;
  nomeRobo: string;
  /** YYYY-MM-DD */
  dia: string;
  /** versaoDoCard(...) de quem chama: congelada ao abrir o diálogo */
  versao: string;
  /** false -> não renderiza nada */
  temOperacao: boolean;
  /** texto visível do botão; padrão "Compartilhar o dia" */
  rotulo?: string;
  /** padrão "outline" */
  variante?: "outline" | "ghost";
  /** padrão `/robos/${slug}` */
  caminhoDoLink?: string;
  /** vai no botão que abre o diálogo */
  className?: string;
  /** robô em conta demo: a legenda do compartilhamento diz "Conta demo." (a imagem já traz o selo); 24/09/2026 */
  contaDemo?: boolean;
}

/**
 * "Compartilhar o dia" (spec §8.8, pedido do Lucas de 24/09/2026): abre, de baixo, a prévia da imagem do dia
 * (/api/og/[slug]/[dia]) em Quadrado ou Story, com Compartilhar (o arquivo, pela folha do celular), Baixar
 * imagem e Copiar link. É o que vai para a live, o WhatsApp e o Instagram sem montar nada na mão. Só aparece
 * com operação no dia: sem ela a rota responde 404 e não há imagem.
 *
 * A versão (cache-buster) é congelada ao abrir: a prévia não troca embaixo do dedo enquanto o diálogo está
 * aberto, e cada abertura pega o dia como está. A folha é o Sheet do projeto (Base UI Dialog): foco preso, Esc
 * fecha e o foco volta ao botão. O X padrão dela tem o texto "Close", em inglês; por isso vai o nosso.
 */
export function CompartilharDia({
  slug,
  nomeRobo,
  dia,
  versao,
  temOperacao,
  rotulo = "Compartilhar o dia",
  variante = "outline",
  caminhoDoLink,
  className,
  contaDemo = false,
}: PropsCompartilharDia) {
  const [aberto, setAberto] = useState(false);
  const [versaoAberta, setVersaoAberta] = useState(versao);
  const [formato, setFormato] = useState<FormatoCard>("quadrado");
  if (!temOperacao) return null;
  const caminho = caminhoDoLink ?? `/robos/${slug}`;

  return (
    <Sheet
      open={aberto}
      onOpenChange={(a) => {
        if (a) setVersaoAberta(versao);
        setAberto(a);
      }}
    >
      <SheetTrigger
        render={
          <Button variant={variante} size="sm" className={className} aria-label={rotuloAcessivelDoBotao(nomeRobo, dia)} />
        }
      >
        <Share2 data-icon="inline-start" aria-hidden />
        {rotulo}
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-4 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <SheetTitle>Compartilhar o dia</SheetTitle>
            <SheetDescription>{`${nomeRobo} · ${formatarDataLonga(dia)}`}</SheetDescription>
          </div>
          <SheetClose render={<Button variant="ghost" size="icon-sm" aria-label="Fechar" />}>
            <XIcon aria-hidden />
          </SheetClose>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Segmentado ariaLabel="Formato da imagem" opcoes={FORMATOS_CARD} valor={formato} onChange={setFormato} />
          <p className="text-xs text-muted-foreground">{dicaDoFormato(formato)}</p>
        </div>

        {/* a chave remonta a prévia a cada formato e a cada abertura: desmontar cancela o pedido no ar */}
        <PreviaDoCard
          key={`${formato}|${versaoAberta}`}
          slug={slug}
          nomeRobo={nomeRobo}
          dia={dia}
          formato={formato}
          versao={versaoAberta}
          caminhoDoLink={caminho}
          contaDemo={contaDemo}
        />
      </SheetContent>
    </Sheet>
  );
}

interface PropsPrevia {
  slug: string;
  nomeRobo: string;
  dia: string;
  formato: FormatoCard;
  versao: string;
  caminhoDoLink: string;
  contaDemo: boolean;
}

type Resultado =
  | { chave: string; estado: "ok"; objetoUrl: string; arquivo: File }
  | { chave: string; estado: "erro"; status: number | null };

/** a rota respondeu, mas sem a imagem: o status decide o texto (404 = dia sem operação pública) */
class FalhaDaImagem extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

/**
 * A prévia e as ações. A PNG é baixada UMA vez, assim que o diálogo abre ou o formato muda, e o mesmo blob
 * serve para a prévia (URL de objeto), para "Baixar imagem" e para "Compartilhar" (24/09/2026). Assim o
 * navigator.share é chamado no próprio clique, sem nenhum await antes: o Safari só compartilha com a
 * ativação do usuário ainda valendo. O setState só acontece na resposta, nunca no corpo do efeito (o padrão
 * do PainelCalendario).
 */
function PreviaDoCard({ slug, nomeRobo, dia, formato, versao, caminhoDoLink, contaDemo }: PropsPrevia) {
  const url = urlDoCard(slug, dia, formato, versao);
  const nome = nomeDoArquivo(slug, dia, formato);
  const [tentativa, setTentativa] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  // só roda no cliente: o diálogo nunca é renderizado no servidor, então não há diferença na hidratação
  const [suportaArquivos] = useState(() => podeCompartilharArquivos());
  const [aviso, setAviso] = useState<string | null>(null);
  const relogioDoAviso = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chave = `${url}#${tentativa}`;
  const pronta = resultado && resultado.chave === chave && resultado.estado === "ok" ? resultado : null;
  const falha = resultado && resultado.chave === chave && resultado.estado === "erro" ? resultado : null;

  useEffect(() => {
    const controle = new AbortController();
    const chaveDoPedido = `${url}#${tentativa}`;
    fetch(url, { signal: controle.signal })
      .then((r) => {
        if (!r.ok) throw new FalhaDaImagem(r.status);
        return r.blob();
      })
      .then(
        (blob) => {
          if (controle.signal.aborted) return;
          const objetoUrl = URL.createObjectURL(blob);
          const arquivo = new File([blob], nome, { type: "image/png" });
          setResultado({ chave: chaveDoPedido, estado: "ok", objetoUrl, arquivo });
        },
        (e: unknown) => {
          if (controle.signal.aborted) return;
          console.warn(`[compartilhar] ${url}:`, e);
          setResultado({ chave: chaveDoPedido, estado: "erro", status: e instanceof FalhaDaImagem ? e.status : null });
        },
      );
    return () => controle.abort();
  }, [url, tentativa, nome]);

  // a URL de objeto vive enquanto a prévia vive: trocar de resultado ou desmontar solta o blob
  const objetoUrl = pronta?.objetoUrl ?? null;
  useEffect(() => {
    return () => {
      if (objetoUrl) URL.revokeObjectURL(objetoUrl);
    };
  }, [objetoUrl]);

  // o aviso some sozinho; o relógio nasce no clique e morre com a prévia
  useEffect(() => {
    return () => {
      if (relogioDoAviso.current) clearTimeout(relogioDoAviso.current);
    };
  }, []);
  const avisar = (texto: string, ms = 3000) => {
    setAviso(texto);
    if (relogioDoAviso.current) clearTimeout(relogioDoAviso.current);
    relogioDoAviso.current = setTimeout(() => setAviso(null), ms);
  };

  const linkAbsoluto = () => window.location.origin + caminhoDoLink;

  // nada de await antes do share: o Safari exige a ativação do usuário (o arquivo já está pronto)
  const compartilhar = async () => {
    if (!pronta) return;
    const dados: ShareData = { files: [pronta.arquivo], ...textosDoCompartilhamento(nomeRobo, dia, linkAbsoluto(), contaDemo) };
    let aceita = false;
    try {
      aceita = navigator.canShare(dados);
    } catch {
      aceita = false;
    }
    if (!aceita) {
      avisar(AVISO_SEM_COMPARTILHAR);
      return;
    }
    try {
      await navigator.share(dados);
    } catch (e) {
      // fechar a folha do celular não é erro
      if (!ehCancelamentoDoCompartilhar(e)) avisar(AVISO_SEM_COMPARTILHAR);
    }
  };

  // funciona com a prévia ainda carregando: o link não depende da imagem
  const copiarLink = () => {
    const link = linkAbsoluto();
    // com o link no aviso, 10 s em vez de 3: é o tempo de a pessoa copiar na mão
    const falhou = () => avisar(`Não deu para copiar. O link é ${link}`, 10000);
    try {
      navigator.clipboard.writeText(link).then(() => avisar(AVISO_LINK_COPIADO), falhou);
    } catch {
      // sem clipboard (http fora do localhost) o acesso lança antes da promessa
      falhou();
    }
  };

  // O estado da prévia numa região viva montada desde o começo (revisão de 24/09/2026): o leitor de tela só
  // anuncia mudança em região que já existe, e o erro aparecia num <p> novo, fora de qualquer região; quem não
  // enxerga só percebia que "Baixar imagem" continuava desabilitado
  const estadoDaPrevia = pronta ? "Imagem pronta." : falha ? mensagemDoErroDaPrevia(falha.status) : "Gerando a imagem…";

  const { largura, altura } = DIMENSOES_CARD[formato];
  // a caixa guarda o lugar da imagem: a proporção do formato, no máximo min(50dvh, 26rem) de altura e a
  // largura do diálogo. A largura sai da altura máxima, senão o max-width achataria a proporção a 375 px
  const caixa: React.CSSProperties = {
    aspectRatio: `${largura} / ${altura}`,
    width: `min(100%, calc(min(50dvh, 26rem) * ${proporcaoDoFormato(formato)}))`,
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p role="status" aria-live="polite" className="sr-only">
        {estadoDaPrevia}
      </p>
      {pronta ? (
        // é um blob local, já baixado: o <Image> do Next não tem o que otimizar
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pronta.objetoUrl}
          width={largura}
          height={altura}
          alt={textoAlternativoDoCard(nomeRobo, dia, formato)}
          className="mx-auto h-auto max-h-[min(50dvh,26rem)] w-auto max-w-full rounded-xl border"
        />
      ) : falha ? (
        <div className="mx-auto flex flex-col items-center justify-center gap-3 rounded-xl border p-4 text-center" style={caixa}>
          <p className="text-sm text-muted-foreground">{mensagemDoErroDaPrevia(falha.status)}</p>
          <Button variant="outline" size="sm" onClick={() => setTentativa((t) => t + 1)}>
            Tentar de novo
          </Button>
        </div>
      ) : (
        <div aria-busy="true" className="relative mx-auto grid place-items-center overflow-hidden rounded-xl border" style={caixa}>
          <Skeleton className="absolute inset-0 rounded-none" />
          <p className="relative px-3 text-center text-xs text-muted-foreground">Gerando a imagem…</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* sem suporte a arquivo o botão some: ficam Baixar e Copiar */}
        {suportaArquivos ? (
          <Button size="sm" disabled={!pronta} onClick={compartilhar}>
            <Share2 data-icon="inline-start" aria-hidden />
            Compartilhar
          </Button>
        ) : null}
        {pronta ? (
          <a href={pronta.objetoUrl} download={nome} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download data-icon="inline-start" aria-hidden />
            Baixar imagem
          </a>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <Download data-icon="inline-start" aria-hidden />
            Baixar imagem
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={copiarLink}>
          <Link2 data-icon="inline-start" aria-hidden />
          Copiar link
        </Button>
      </div>

      {/* a região existe desde o começo, vazia: o leitor de tela só anuncia mudança em região já montada */}
      <p role="status" aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
        {aviso}
      </p>
    </div>
  );
}
