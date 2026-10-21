# Publicar en Figma Community

Guía para publicar (o actualizar) el plugin. La publicación se hace desde la app de escritorio de Figma; no hay CLI.

## 1. Preparar el build

```bash
npm ci
npm run lint
npm test
npm run build
```

`npm run build` genera los dos archivos que Figma sube al publicar:

| Archivo | Qué es |
|---|---|
| `code.js` | Lógica del plugin (compilada desde `code.ts`) |
| `dist/ui.html` | Interfaz en un solo HTML, con FigUI3 incluido y su aviso de licencia MIT al inicio |

Ninguno de los dos se versiona (están en `.gitignore`): genéralos siempre justo antes de publicar.

## 2. Probar en Figma

1. Figma desktop → **Plugins → Development → Import plugin from manifest…** → `manifest.json`.
2. En un archivo con variables locales, prueba en tema **claro y oscuro** (Figma → Preferences → Theme):
   - [ ] La lista de colecciones y modos carga.
   - [ ] Generate produce CSS y Tailwind; los modos salen como `[data-theme="…"]`.
   - [ ] **Copy CSS / Copy Tailwind** copia al portapapeles.
   - [ ] Un alias a una variable de librería externa no rompe la exportación.
   - [ ] Todo se puede usar con teclado (Tab, Space, flechas, Enter).

## 3. Publicar

Figma desktop → **Plugins → Manage plugins** → *Tokens to Code* (antes *Variables to CSS and Tailwind*) → **Publish** (o **Publish new version** si ya está publicado).

`manifest.json` ya tiene el `id` `1542210914567728604`. Si ese id pertenece a un plugin ya publicado con tu cuenta, Figma lo tratará como una **nueva versión**; si no, crea el plugin desde *Manage plugins* y copia el id nuevo al manifest.

### Assets

| Campo | Archivo | Tamaño requerido |
|---|---|---|
| Icon | `assets/icon.png` | 128 × 128 px |
| Cover art | `assets/cover.png` | 1920 × 1080 px |
| Carousel (opcional) | `assets/gallery-1-modes.png`, `assets/gallery-2-tailwind.png` | 1920 × 1080 px |

Las imágenes se generan desde `design/marketing/`. Muestran la UI real del plugin y la salida real de `code.js` con un sistema de variables de demo (`demo-figma.js`):

```bash
npm run build && design/marketing/render.sh
```

Después copia `design/marketing/out/{cover,modes,tailwind}.png` a `assets/`.

### Textos de la ficha (en inglés, como la UI)

**Name**
```text
Tokens to Code
```

**Tagline**
```text
Export Figma variables as CSS custom properties and a Tailwind theme.
```

**Description**
```text
Turn your local Figma variables into code your developers can paste straight into a project.

• CSS custom properties for every collection, with each mode (Light, Dark, …) as a :root[data-theme="…"] block and the default mode in :root.
• A tailwind.config.js theme (colors, spacing, radius, border width, font size, line height, letter spacing, font weight and font family) that points to those CSS variables, so theming keeps working.
• Aliases stay as var(--…) references; aliases to library variables are written with their resolved value.
• Uses your variables' Code Syntax (Web) names, or the Figma names, with an optional prefix.
• Colors keep their alpha; font weights, opacity and line-height multipliers are exported without units.

How to use: open the plugin, pick the collections and modes to export, choose CSS and/or Tailwind, click Generate and copy the result.

Works offline: the plugin reads only local variables and makes no network requests.
```

**Version notes** (para *Publish new version*)
```text
New native Figma (UI3) interface with light and dark theme support, keyboard navigation and per-mode selection.
Fixes: aliases to library variables no longer fail, Code Syntax names are respected, single-mode collections are written to :root, colors keep their alpha, and font weights no longer get "px".
```

**Tags** (máx. 12)
```text
variables, design tokens, css, tailwind, developer handoff, code, theming, dark mode, export, css variables
```

**Categoría sugerida:** Development (o la más cercana que ofrezca el formulario)

**Support contact:** _(completa con el correo o la URL de soporte que quieras hacer pública)_

## 4. Revisión de Figma

- `networkAccess.allowedDomains` es `["none"]`: el plugin no hace peticiones de red, así que no necesita justificación de dominios.
- `documentAccess: "dynamic-page"`: el código usa sólo las APIs asíncronas (`getLocalVariablesAsync`, `getVariableByIdAsync`, …).
- Licencias de terceros: ver `THIRD_PARTY_NOTICES.md`. Sólo se incluye el núcleo MIT de FigUI3; los módulos editor/lab (PolyForm Shield) **no** se usan.
