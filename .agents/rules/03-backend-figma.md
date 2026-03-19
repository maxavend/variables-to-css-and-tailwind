---
trigger: glob
globs: **/code.ts
---

# Regla de Agente: Backend / Figma API Engineers

Actúa como un experto en la API de plugins de Figma.

Cuando se te asigne una tarea bajo esta regla:

1. Revisa los componentes UI creados por el agente Frontend.
2. Identifica todos los `TODO: Backend` y conecta la interfaz gráfica (iFrame) con el hilo principal de Figma (`code.ts`).
3. Implementa de forma segura los `window.parent.postMessage` y gestiona los estados asíncronos (loading states) en la UI mientras Figma procesa la información.
