# Variables to CSS

Este repositorio contiene un plugin de Figma especializado en extraer variables de diseño y exportarlas directamente a CSS custom properties.

## Contenido del repositorio

- `code.ts` / `code.js` — Lógica principal del plugin que se ejecuta dentro de Figma.
- `ui.html` — Interfaz de usuario embebida para interactuar con el plugin.
- `manifest.json` — Metadatos del plugin (entradas `main` y `ui`).
- `package.json` — Scripts y dependencias del proyecto.
- `tsconfig.json` — Configuración de TypeScript (si aplica).

El plugin permite convertir tus variables de Figma (colores, espaciados, tipografías, etc.) en un bloque de código CSS organizado con comentarios.

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

### Ejemplo de salida

```css
:root {
  /* --- Brand / Primary --- */
  --primary-500: rgb(31 122 224);
}
```
