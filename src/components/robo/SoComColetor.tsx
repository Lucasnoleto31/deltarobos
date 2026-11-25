"use client";

import { notFound, useSelectedLayoutSegment } from "next/navigation";

interface Props {
  /** robos.tem_coletor: o robô é acompanhado ao vivo */
  temColetor: boolean;
  children: React.ReactNode;
}

/**
 * A aba Ao vivo (/robos/[slug]/hoje) só existe em robô com coletor. A página dela já responde notFound(), mas
 * toda aba do robô é desenhada dentro do esqueleto de carregamento (loading.tsx), e o que acontece ali dentro
 * chega depois de a resposta ter começado: o endereço sairia com código 200 e a tela de "não encontrado" por
 * cima. Este guarda fica no layout, antes do esqueleto, e por isso o endereço de um robô sem coletor responde
 * 404 de verdade. Nas outras abas ele só repassa o conteúdo.
 */
export function SoComColetor({ temColetor, children }: Props) {
  const aba = useSelectedLayoutSegment();
  if (!temColetor && aba === "hoje") notFound();
  return children;
}
