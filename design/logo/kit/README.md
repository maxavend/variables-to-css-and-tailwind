# Tokens to Code — Guía de logo

## 1. La idea

**Abanico de modos.** Un abanico de swatches: cada tarjeta es una variable en uno de sus modos (claro, oscuro, contraste). La tarjeta del frente lleva el `--` de las custom properties de CSS, que marca el paso de diseño a código. Las tarjetas de atrás forman un barrido que sugiere viento, como un guiño a *Tail**wind***.

El lenguaje es nativo de Apple:
- **Esquinas continuas:** las tarjetas son superelipses (n = 5), la misma familia de curva de los íconos de Apple, no rectángulos con radio circular.
- **Colores del sistema de Apple.**
- **Luz desde arriba** y sombras de contacto mínimas.
- **Sin halos, resplandores ni brillos decorativos.**

## 2. Dos versiones del símbolo

| Versión | Cuándo usarla | Archivos |
|---|---|---|
| **Liquid Glass** (principal) | Ícono del plugin, portada, README, redes, presentaciones. Cualquier uso en pantalla a 48 px o más. Hay versión clara (principal) y oscura. | `final/glass/` |
| **Plana** (base) | Un solo color, favicon, tamaños chicos, impresión, bordado, láser y cualquier lugar donde no se puedan usar degradados ni transparencias. | `final/svg/`, `final/png/`, `final/web/` |

Las dos versiones usan la misma geometría. En la plana, las tarjetas van separadas por huecos reales, así que funciona en un color y en negativo. En la de vidrio, las tarjetas se superponen como láminas de vidrio teñido y la del frente deja ver los colores de atrás hacia el borde que se superpone.

## 3. Formatos

- **Horizontal**: el formato principal, con el símbolo y el nombre en una línea (`logo-horizontal-*`).
- **Apilado**: el símbolo arriba y el nombre centrado debajo (`logo-stacked-*`).
- **Símbolo solo**: para el ícono, el avatar y el favicon (`symbol-*`, `icon-*`).
- **Solo el nombre**: `wordmark-color.svg`, para cuando el símbolo ya aparece cerca.

No reordenes ni cambies el tamaño de las partes de un formato. No escribas el nombre a mano: usa los archivos, que ya tienen el texto convertido en curvas.

## 4. Espacio libre

Alrededor del logo deja libre **X** por cada lado, donde **X = ¼ del alto de la tarjeta del frente**. Ese espacio crece y se achica junto con el logo.

## 5. Tamaño mínimo

| Versión | Pantalla | Impresión |
|---|---|---|
| Horizontal | 160 px de ancho | 35 mm |
| Símbolo plano | 24 px | 8 mm |
| Símbolo de 24 px o menos | `symbol-small-*` (huecos y guiones más grandes) | 6 mm |
| Símbolo de vidrio | 48 px; bajo eso, usa la versión plana | No se usa en impresión |

## 6. Color

| Nombre | Equivalente en Apple | Uso | HEX | RGB | CMYK aprox. |
|---|---|---|---|---|---|
| Azul | systemBlue | Tarjeta del frente, acento | `#007AFF` | 0 122 255 | 100 52 0 0 |
| Naranja | systemOrange (modo oscuro) | Tarjeta del medio | `#FF9F0A` | 255 159 10 | 0 38 96 0 |
| Rojo | systemRed (modo oscuro) | Tarjeta de atrás | `#FF453A` | 255 69 58 | 0 73 77 0 |
| Negro etiqueta | label | Nombre | `#1D1D1F` | 29 29 31 | 6 6 0 88 |

Los valores CMYK son aproximados. Si vas a imprimir, verifícalos con una guía de color.

**Combinaciones aprobadas:**
- color sobre blanco o sobre `#F2F2F7`
- color sobre `#1D1D1F`
- negro sobre claro
- blanco sobre oscuro o sobre azul
- un solo color en azul o en negro etiqueta (`symbol-mono-*`)

### Receta del vidrio (para rehacerlo en Figma)

- **Fondo del ícono:**
  - Claro: degradado vertical `#FFFFFF → #E9EBF0`.
  - Oscuro: degradado vertical `#2C2C2E → #0B0B0C`.
  - El símbolo ocupa el 80 % del ícono y va corrido un poco a la derecha para que quede centrado a la vista.
- **Cada tarjeta:**
  - Un degradado vertical de su color: rojo `#FF7A70 → #FF453A`, naranja `#FFBE4D → #FF9F0A`, azul `#4DA3FF → #007AFF` al 86–94 %.
  - Un baño de luz blanca del 32 % al 0 % en la mitad superior.
  - Un borde interior de 1,5 px: blanco al 95 % arriba, que desaparece en los costados y vuelve al 35 % abajo.
  - Una sombra de contacto corta: y 3, desenfoque 4, negro al 14 % sobre claro o al 45 % sobre oscuro.
- **Tarjeta del frente:** vidrio esmerilado. Bajo el tinte azul se ven, desenfocadas, las tarjetas de atrás, pero solo hacia el borde derecho, que es donde se superponen.
- **Guiones `--`:** blanco puro con una sombra de 1 px, como si estuvieran ligeramente hundidos.

En `final/glass/icon-composer-layers/` están las capas planas sin máscara (fondo, tres tarjetas y guiones). Si algún día haces una app de Apple, Icon Composer les aplica el vidrio de forma nativa y dinámica.

## 7. Tipografía

**Inter SemiBold**, con el espaciado entre letras reducido en un 2 %, como Apple compone sus títulos. Inter tiene licencia SIL Open Font License, así que se puede usar en un logo. En los archivos el texto ya está convertido en curvas.

SF Pro sería la fuente más nativa, pero su licencia no permite usarla en logos. Inter es la fuente de la interfaz de Figma, así que el plugin se ve coherente con su entorno.

## 8. Qué no hacer

- No estirar, rotar ni inclinar el logo.
- No cambiar el orden de los colores (azul al frente, naranja al medio, rojo atrás).
- No usar colores fuera de la paleta.
- No agregarle halos, resplandores, contornos ni efectos a ninguna versión.
- No usar la versión de vidrio en un color, en impresión ni bajo 48 px.
- No poner el logo sobre fondos recargados sin usar el ícono como contenedor.

## 9. Archivos

```
final/
  glass/        Liquid Glass: icon-glass e icon-glass-dark (SVG y PNG de 128/512/1024),
                símbolo sobre claro y oscuro, horizontales, capas para Icon Composer
  svg/          Masters planos: símbolo (color, negro, blanco, mono, pequeño), horizontal, apilado, nombre, ícono
  png/          PNG de los masters planos
  web/          favicon.ico/svg, apple-touch-icon, icon-192/512, maskable, site.webmanifest, head-snippet.html
board/          Lámina de presentación (presentation.html y slides/*.png)
review/         Hoja de pruebas: escalas, 16 px, fondos, un color, desenfoque
src/            Generadores: symbol.py → lockups.py → glass.py, y build.sh para regenerar todo
```

Para regenerar todo el kit (Python con `shapely fonttools brotli uharfbuzz`; Inter está en `@fontsource/inter`):

```bash
PY=python FONT=…/inter-latin-600-normal.woff2 SKILL=…/logo-design/scripts ./src/build.sh
```

## 10. Notas

- No se hizo búsqueda de marcas registradas. Antes de un uso comercial amplio, conviene una búsqueda profesional y una búsqueda inversa de imágenes.
- Las tarjetas se generan como polilíneas finas, porque las superelipses y las operaciones booleanas no tienen arcos exactos en SVG. Son invisibles a cualquier tamaño de pantalla. Los guiones sí son arcos exactos.
