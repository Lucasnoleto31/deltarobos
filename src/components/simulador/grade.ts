// A grade do simulador (25/11/2026) e o lugar de cada bloco nela. Mora num arquivo sem "use client" porque
// dois lugares a usam: o painel, no navegador, e o esqueleto que a página do servidor mostra enquanto o
// painel não hidrata. Com as mesmas classes o esqueleto ocupa os mesmos lugares e a tela não pula.
//
// A ordem dos blocos no código é a do celular (uma coluna): capital, resposta, robôs, resultado, mais
// números. Entre o tablet e a tela larga, o capital e a resposta ficam à esquerda dos robôs, e o resto vem
// embaixo na largura toda. Em tela larga (xl) são 12 colunas: à esquerda (4) o capital, os robôs e mais
// números; à direita (8) a resposta e o resultado com a curva, que desce pelas duas últimas linhas.

// grid-cols-1 é minmax(0, 1fr): no celular a coluna tem a largura da tela e nada a alarga (sem ela a coluna
// cresceria com o conteúdo mais largo, e a página rolaria de lado)
export const GRADE_DO_SIMULADOR =
  "grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] md:grid-rows-[auto_1fr] xl:grid-cols-12 xl:grid-rows-[auto_auto_1fr] xl:gap-y-10";

export const LUGAR_DO_CAPITAL = "md:col-start-1 md:row-start-1 xl:col-span-4 xl:col-start-1 xl:self-start";

// Em tela larga a resposta guarda a altura de duas linhas de frase: a lista de robôs divide a linha da grade
// com ela e não pode subir e descer a cada capital digitado.
export const LUGAR_DA_RESPOSTA = "min-w-0 md:col-start-1 md:row-start-2 xl:col-span-8 xl:col-start-5 xl:row-start-1 xl:min-h-21";

export const LUGAR_DOS_ROBOS = "md:col-start-2 md:row-span-2 md:row-start-1 xl:col-span-4 xl:col-start-1 xl:row-span-1 xl:row-start-2 xl:self-start";

export const LUGAR_DO_RESULTADO = "min-w-0 md:col-span-2 xl:col-span-8 xl:col-start-5 xl:row-span-2 xl:row-start-2";

export const LUGAR_DE_MAIS_NUMEROS = "md:col-span-2 xl:col-span-4 xl:col-start-1 xl:row-start-3 xl:self-start";
