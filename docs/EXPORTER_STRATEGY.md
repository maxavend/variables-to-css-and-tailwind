# Estrategia de Exportación: Figma to Design System (CSS/Tailwind)

Este documento guarda la lógica core y las reglas de oro implementadas para asegurar un output de CSS/Tailwind profesional, organizado y fiel al diseño original en Figma.

## 1. El Principio de Orden Inmutable (Figma Native)

Para que el CSS sea un reflejo exacto de la UI de Figma, **NUNCA** debemos aplicar ordenamientos automáticos (alfabéticos o numéricos).

### Implementación:
- Se itera sobre `collection.variableIds` de forma secuencial.
- Este array contiene el orden exacto (drag-and-drop) definido por el usuario en Figma.
- Cualquier "Natural Sort" artificial destruye la intención del diseñador.

## 2. Agrupación Robusta por Diccionario (Map)

Para evitar que los encabezados de carpeta se repitan o se desorganicen si las variables no son contiguas, se procesa en dos pasos:

### Paso A: Recolección (Grouping)
```typescript
type FolderMap = Map<string, string[]>; // FolderPath -> CSS Lines
type BlockMap = Map<string, FolderMap>; // BlockKey -> FolderMap
```
Mientras se itera por `variableIds`, cada línea de CSS se inyecta en su correspondiente "cajón" de carpeta dentro de un `Map`.

### Paso B: Renderización (Printing)
Se itera sobre el `Map` resultante. Esto garantiza que cada carpeta se procese **UNA SOLA VEZ**, agrupando todos sus tokens juntos, independientemente de si estaban separados en la lista original de IDs.

## 3. Limpieza Quirúrgica de Sintaxis (Trim & Replace)

Figma y la manipulación de strings a veces inyectan saltos de línea (`\n`) o espacios residuales.

### Reglas de Limpieza:
1. **Normalización**: Cada componente de la línea (nombre de variable, valor) debe pasar por `.replace(/\n/g, "").trim()`.
2. **Formato Único**: La línea final debe ser estrictamente `${name}: ${value};` sin espacios antes de los dos puntos y sin saltos de línea intermedios.

## 4. Estructura Dinámica de Secciones

No se asumen categorías hardcodeadas como "Colors" o "Typography". Las secciones se dictan estrictamente por la estructura de carpetas definida en el nombre de la variable (`v.name`).

- `folder/subfolder/token` -> `/* --- folder / subfolder --- */`
- No folder -> `/* --- Root Variables --- */`

---
*Este documento sirve como "Source of Truth" para evitar regresiones y asegurar que el plugin mantenga su estándar de calidad mundial.*
