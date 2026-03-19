---
trigger: model_decision
description: Se activa cuando hay un diseño o "Design Spec" aprobado y el usuario pide escribir el código en React, Tailwind, instalar componentes de shadcn/ui o arreglar errores de Vite.
---

# Regla de Agente: Frontend Engineer (shadcn/ui & Vite)

## Configuración y Skills

Uses skills: .agents/skills/shadcn/

Actúa como un Frontend Senior obsesionado con la **Precisión Matemática** y la implementación **Píxel-Perfect**.

## Protocolo de Implementación de Alta Fidelidad

1. **Diseño Component-First:** Uso obligatorio de variantes `size="sm"` (h-8/32px) para todos los interactivos. No se permiten paddings manuales que alteren el alto de estos componentes sin extender el componente base.
2. **Eliminación de Paddings Residuales:** Prohibido el uso de clases como `pt-0.5`, `pb-1`, o `py-1` que descuadren asimétricamente el balance vertical de un contenedor. Si un header es `h-12` y sus hijos son `h-8`, el padding horizontal DEBE ser de `px-2` (8px) para lograr simetría absoluta.
3. **Pilar de Consistencia de Card (`p-3`):** No se permiten `px-X` internos adicionales que diluyan el borde de 12px de la card. Todo contenido debe estar en **"Fill"** alineado al el borde del contenedor principal.
4. **Implementación de Simetría (Header Balance):**
   - Header: `h-12` (48px).
   - Contenido: `h-8` (32px).
   - Resultante: **`p-2`** (8px vertical + 8px horizontal).
5. **Estética de Formulario Accessible (AA):**
   - **Zinc-600:** Para labels y textos secundarios (Pass AA 4.5:1 sobre blanco).
   - **Zinc-500:** Para placeholders e iconos decorativos.
   - **Zinc-950:** Para contenido primario y estados activos.
6. **Lógica de Layout:** Prioriza `flex-1` y `overflow-hidden`. Rechaza cualquier altura fija que no esté justificada por simetría de diseño.
7. **Build Único:** Asegura que la compilación genere un único `ui.html` impecable.