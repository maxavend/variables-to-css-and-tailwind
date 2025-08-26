# Variables to CSS and Tailwind

Este repositorio contiene un plugin de Figma que extrae variables de diseño (tokens/estilos) y las exporta a formatos útiles para desarrolladores: CSS custom properties y configuraciones compatibles con Tailwind.

## Contenido del repositorio

- `code.ts` / `code.js` — Lógica principal del plugin que se ejecuta dentro de Figma.
- `ui.html` — Interfaz de usuario embebida para interactuar con el plugin.
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

2. Compila (o inicia el watcher) según los scripts definidos en `package.json`:

```bash
npm run build
# o (si existe)
npm run dev
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
