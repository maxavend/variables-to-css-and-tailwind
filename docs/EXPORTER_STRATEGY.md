# Estrategia de Exportación: Figma to Design System (Tailwind V4 Compatible)

Este documento guarda la lógica core y las reglas de oro implementadas para asegurar un output de CSS compatible con Tailwind V4, respetando el 'Code Syntax' de Figma.

## 1. El Principio de Orden Inmutable (Figma Native)

Para que el CSS sea un reflejo exacto de la UI de Figma, **NUNCA** debemos aplicar ordenamientos automáticos (alfabéticos o numéricos).

### Implementación:
- Se itera sobre `collection.variableIds` de forma secuencial.
- Este array contiene el orden exacto (drag-and-drop) definido por el usuario en Figma.

## 2. Respeto Absoluto al 'Code Syntax'

Si el diseñador ha definido una sintaxis de código específica en Figma, el plugin la respeta por encima de cualquier otra regla de nomenclatura.

### Reglas de Nomenclatura:
1. **Prioridad Máxima**: Si existe `codeSyntax` (en cualquiera de sus variantes de plataforma), se usa ese valor **LITERAL**.
2. **Sin Prefijos Forzados**: Cuando se detecta Code Syntax, el plugin **NO** añade prefijos automáticos como `--color-` o `--spacing-`. El usuario es dueño total del namespace.
3. **Fallback**: Si no hay Code Syntax, se usa el nombre de Figma en kebab-case.

## 3. Arquitectura Tailwind V4 (@theme inline)

Se ha eliminado la exportación de `tailwind.config.js` (V3) en favor de un bloque de CSS compatible con el motor de Tailwind V4.

### Formato de Salida:
```css
@import "tailwindcss";
@theme inline {
  --semantic-token: var(--primitive-token);
}
```

## 4. Agrupación por Map (Garantizada)

Para evitar duplicidad de comentarios en las secciones, se utiliza un sistema de pre-agrupación:
- **Paso A**: Recolección en un `Map<Folder, string[]>`.
- **Paso B**: Renderización atómica por carpeta.

## 5. Limpieza Quirúrgica de Sintaxis

- Todo el output se somete a `.replace(/\n/g, "").trim()` para asegurar que no haya saltos de línea residuales dentro de las variables CSS.
- **Formato de Color (V4)**: Los colores se envuelven en `rgb()` y las opacidades se integran como `rgb(r g b / alpha)`.
- **Tipografía**: Las variables de fuente incluyen automáticamente un fallback `, sans-serif`.
- Formato único: `--nombre: valor;` (una sola línea).

---
*Este documento sirve como "Source of Truth" para evitar regresiones y asegurar que el plugin mantenga su estándar de calidad mundial.*
