# Checkpoint: Integración Style Dictionary — rama feature-style-dictionary

Fecha: 27 de agosto de 2025
Branch: `feature-style-dictionary`

Resumen rápido
- Hemos preparado el plugin para exportar tokens en formato compatible con Style Dictionary (SD) y añadimos una configuración básica de SD al repo.
- Estado: parcial — UI y plugin ya generan/entregan el JSON; falta instalar/configurar Style Dictionary y (opcional) scripts de conversión/automatización.

Qué se ha modificado / añadido
- `code.ts` — ahora crea un objeto `sdTokens` durante la generación y lo devuelve en el mensaje `RESULT` al UI. (mapea colores y otros tokens mínimamente)
- `ui.html` — se añadió un textarea `#out-sd` y un botón `Export SD JSON` para ver/descargar `tokens.json` desde la UI.
- `style-dictionary.config.js` — archivo de configuración base para Style Dictionary (plataformas CSS / JSON / Tailwind).

Estado actual (detalles)
- El plugin (en Figma) puede: Generate → devolverte CSS, Tailwind y un objeto `sdTokens` que la UI muestra; pulsando `Export SD JSON` descarga `tokens.json`.
- No se añadieron (todavía) scripts npm para ejecutar Style Dictionary y no se instalaron dependencias. Puedes ejecutar SD con `npx style-dictionary` si instalas la dependencia.
- `code.ts` y `ui.html` fueron modificados en la rama `feature-style-dictionary`.
- Nota: `style-dictionary.config.js` es un archivo Node; el linter de TypeScript puede avisar sobre `module.exports` pero eso es normal para este tipo de fichero.

Pasos para retomar (rápido, manual)
1. Genera y descarga `tokens.json` desde el plugin (Figma → plugin → Generate → Export SD JSON).
2. Mueve `tokens.json` al repo (ubicación sugerida):

```bash
# desde tu carpeta de descargas (ejemplo)
mv ~/Downloads/tokens.json ./tokens/tokens.json
```

3. Instala Style Dictionary (y opcionalmente chokidar para watch):

```bash
npm install --save-dev style-dictionary chokidar-cli
```

4. Ejecuta Style Dictionary con la configuración incluida:

```bash
npx style-dictionary build --config style-dictionary.config.js
# o, si agregas el script, más cómodo: npm run build:tokens
```

5. Resultado: los artefactos aparecerán en `build/` (por ejemplo `build/css/variables.css` y `build/tailwind/tailwind-theme.js`).

Cambios pendientes recomendados
- Añadir scripts npm en `package.json`:

```json
"scripts": {
  "build:tokens": "style-dictionary build --config style-dictionary.config.js",
  "watch:tokens": "chokidar 'tokens/**/*.json' -c \"npm run build:tokens\"",
  "build:all": "npm run build:tokens"
}
```

- (Opcional) Crear `scripts/convert-plugin-to-sd.js` si tu `tokens.json` descargado necesita conversión a la estructura exacta que espera SD.
- (Opcional) Crear un formato personalizado para Tailwind (`formats/tailwind-format.js`) si quieres que el output sea exactamente `module.exports = { theme: { extend: { colors: ... } } }` listo para importar.

Notas y riesgos
- Limitación natural: el plugin (desde Figma) no puede escribir directamente en el repo; por eso el flujo usa descarga manual del JSON y luego build local.
- Normalización: revisa nombres/kebab-case en `tokens.json` para evitar claves inválidas en SD.
- Transparencia: colores con alpha se exportan como `rgba(...)` por defecto cuando corresponde.

Siguientes pasos sugeridos (elige uno)
- A) Te acompaño a instalar dependencias y ejecuto `npx style-dictionary build` para verificar artefactos.
- B) Implemento el script de conversión automático (`scripts/convert-plugin-to-sd.js`) y los scripts npm (`package.json`) para dejar todo automatizado.
- C) Creo un formato Tailwind personalizado y lo registro en `style-dictionary.config.js` para producir directamente `tailwind-theme.js` listo.

Contacto para retomar
- Rama para continuar: `feature-style-dictionary` (haz `git switch feature-style-dictionary` para volver aquí).
- Si quieres que haga A/B/C, dime cuál y lo implemento ahora.

---
Archivo generado automáticamente para checkpoint; guárdalo en el repo y coméntame qué siguiente paso quieres que haga.
