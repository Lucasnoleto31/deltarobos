import { cn } from "cn";

/* Símbolo da marca: o "Z" da Zeve, do mídia kit (Documentos/Midiakit/zeve Z 1.png), desde 13/10/2026; até
   então o brasão da Quants. Vetorizado do PNG de 320 x 234 com potrace (um contorno só) e conferido
   renderizado ao lado do original. Uma cor só, a do texto (currentColor); por padrão o azul do acento
   (text-primary). SIMBOLO_CAMINHOS serve à imagem OG e ao PDF, que não leem CSS. */

export const SIMBOLO_VIEWBOX = "0 0 320 234";

export const SIMBOLO_CAMINHOS: readonly string[] = [
  "M94.4 232.2C87.9 229.9 79.9 224.8 76.1 220.4C70.6 214.2 70.5 212.9 75.0 172.3C77.2 152.1 79.4 131.6 79.9 126.9C81.0 116.9 80.1 111.7 76.7 108.3C71.5 103.0 64.0 103.5 42.4 110.5C15.3 119.2 10.2 119.4 4.1 112.5C-1.9 105.6 -1.0 96.6 6.3 90.7C12.3 85.8 96.5 30.7 102.5 27.6C112.9 22.4 120.9 22.4 130.8 27.4C136.3 30.2 143.6 37.7 144.6 41.5C146.2 47.7 144.0 59.5 134.6 95.0C129.3 115.1 124.7 133.6 124.4 136.1C123.2 145.4 127.3 151.0 135.4 151.0C138.1 151.0 140.0 150.1 143.2 147.2C145.4 145.2 170.7 117.0 199.3 84.5C263.2 12.0 269.3 5.4 274.1 2.9C281.0 -0.6 288.4 1.1 300.1 9.0C314.8 19.1 321.0 27.4 319.1 34.7C317.7 39.6 314.9 42.6 281.0 74.0C265.4 88.6 241.8 110.6 228.6 123.0C164.8 183.0 149.1 197.6 131.7 213.4C121.4 222.8 111.2 231.3 109.2 232.2C104.5 234.4 100.8 234.4 94.4 232.2Z",
];

export function Simbolo({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox={SIMBOLO_VIEWBOX} fill="currentColor" className={cn("text-primary", className)} {...props}>
      {SIMBOLO_CAMINHOS.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
