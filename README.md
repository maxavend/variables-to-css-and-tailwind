# Variables to CSS and Tailwind

Este repositorio contiene un plugin de Figma que extrae variables de diseño (tokens/estilos) y las exporta a formatos útiles para desarrolladores: CSS custom properties y configuraciones compatibles con Tailwind.

## Contenido del repositorio

- `code.ts` / `code.js` — Lógica principal del plugin que se ejecuta dentro de Figma.
- `ui/` — Fuente de la interfaz (UI3 nativa con [FigUI3](https://www.npmjs.com/package/@rogieking/figui3)): `index.html`, `main.js`, `styles.css`.
- `dist/ui.html` — Interfaz compilada en un solo HTML (Vite + `vite-plugin-singlefile`); la genera `npm run build`.
- `manifest.json` — Metadatos del plugin (entradas `main` y `ui`).
- `package.json` — Scripts y dependencias del proyecto.
- `tsconfig.json` — Configuración de TypeScript (si aplica).

## Descripción

El plugin permite extraer tokens de diseño (colores, tipografías, tamaños, sombras, espaciados, etc.) desde un archivo de Figma y convertirlos en:

- CSS custom properties (ej. `--color-primary-500`).
- Bloques o snippets recomendados para integrar en `tailwind.config.js`.
- JSON plano para integración con otros sistemas (Style Dictionary, tokens management, etc.).

Está pensado para acelerar el flujo entre diseñadores y desarrolladores y mantener la coherencia del diseño en el código.

## Requisitos

- Node.js 14+ (recomendado).
- npm o yarn.
- Figma (para probar el plugin en modo desarrollo).

## Desarrollo — inicio rápido

1. Instala dependencias:

```bash
npm install
# o
yarn
```

2. Compila el código del plugin (`code.js`) y la UI (`dist/ui.html`):

```bash
npm run build
# por separado: npm run build:code / npm run build:ui
```

3. Para probar el plugin en Figma (modo desarrollo):

- Abre Figma → Plugins → Development → Import plugin from manifest...
- Selecciona el archivo `manifest.json` de este proyecto.

4. Ejecuta el plugin desde Figma en un archivo que contenga estilos y tokens.

## Uso básico

1. Selecciona el plugin en Figma y ábrelo.
2. En la UI, elige qué tipos de tokens deseas exportar (colores, tipografías, espaciados, etc.).
3. Elige el formato de salida: CSS, Tailwind o JSON.
4. Copia el resultado o descárgalo según la opción disponible.

### Ejemplo de salida CSS

```css
:root {
  --primary-500: #1f7ae0;
  --secondary-300: #f3c677;
}
```

### Ejemplo (sugerencia) para `tailwind.config.js`

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          500: '#1f7ae0'
        }
      }
    }
  }
}
```
