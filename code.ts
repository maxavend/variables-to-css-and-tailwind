/// <reference types="@figma/plugin-typings" />
// @ts-ignore
declare const __html__: string;

// Muestra la interfaz del plugin con el tamaño especificado
figma.showUI(__html__, { width: 900, height: 600 });

// --- TIPOS GLOBALES Y ESTRUCTURAS DE DATOS ---

type ExportFormat = "css" | "tailwind";
type NameMode = "code-syntax" | "figma-name";
type CategoryKey = "Colors" | "Spacing" | "Typography" | "Other";

// Define la estructura del mensaje que la UI envía al plugin
interface UIRequest {
  type: "INIT" | "RUN";
  payload?: {
    collectionIds?: string[];
    nameMode?: NameMode;
    format?: ExportFormat[];
    unitPxForFloat?: boolean;
    unitMode?: "px" | "rem";
    colorFormat?: "rgb-raw" | "hex" | "oklch";
    baseSize?: number;
    prefix?: string;
    modesByCollection?: Record<string, string>;
  };
}

// Extiende el tipo `Variable` para incluir posibles campos de sintaxis de código personalizados
type VariableWithCodeSyntax = Variable & Partial<{
  codeSyntax: string;
  code_syntax: string;
  codeName: string;
  nameForCode: string;
  nameForCodeSyntax: string;
}>;

// Estructura para organizar los datos que se enviarán a la configuración de Tailwind
interface TwData {
  colors: Record<string, Record<string, string>>;
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  borderWidth: Record<string, string>;
  fontSize: Record<string, string>;
  lineHeight: Record<string, string>;
  letterSpacing: Record<string, string>;
  fontWeight: Record<string, string>;
  fontFamily: Record<string, string>;
  tokens?: Record<string, string>;
}

// Estructuras de datos para organizar las líneas de CSS antes de generarlas
type FolderMap = Map<string, string[]>; // FolderPath -> CSS Lines
type BlockMap = Map<string, FolderMap>; // BlockKey -> FolderMap


// --- MANEJO DE MENSAJES DE LA UI (PUNTO DE ENTRADA) ---

/**
 * Escucha y procesa los mensajes que llegan desde la UI (ui.html).
 * Este es el controlador principal del plugin.
 */
figma.ui.onmessage = async (msg: UIRequest) => {
  // 1. Mensaje 'INIT': Se recibe al cargar el plugin.
  // Su propósito es obtener los datos iniciales (colecciones, variables) y enviarlos a la UI.
  if (msg.type === "INIT") {
    try {
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const variables = await figma.variables.getLocalVariablesAsync();
      
      const packedData = collections.map(c => ({
        id: c.id,
        name: c.name,
        modes: c.modes.map(m => ({ modeId: m.modeId, name: m.name })),
        variableCount: variables.filter(v => v.variableCollectionId === c.id).length
      }));
      
      figma.ui.postMessage({ type: "INIT_DATA", payload: packedData });

    } catch (e) {
      console.error("Error en INIT:", e);
      figma.notify("Error al cargar las colecciones.", { error: true });
    }
    return;
  }

  // 2. Mensaje 'RUN': Se recibe cuando el usuario hace clic en "Generate".
  // Activa la lógica principal para procesar las variables y generar el código.
  if (msg.type === "RUN") {
    try {
      const {
        collectionIds = [],
        nameMode = "code-syntax",
        format = ["css", "tailwind"],
        unitPxForFloat = true,
        unitMode = "px",
        colorFormat = "rgb-raw",
        baseSize = 16,
        prefix = "",
        modesByCollection = {}
      } = msg.payload || {};

      const allCollections = await figma.variables.getLocalVariableCollectionsAsync();
      const allVariables = await figma.variables.getLocalVariablesAsync();

      const selectedCollectionIds = (collectionIds && collectionIds.length)
        ? new Set(collectionIds)
        : new Set(allCollections.map(c => c.id));
      
      const selectedVars = allVariables.filter(v => selectedCollectionIds.has(v.variableCollectionId));

      const { css, tailwind } = await processAndGenerateCode({
        selectedVars, 
        allCollections, 
        selectedCollectionIds, // Pass this down
        allVariables,         // Pass this down
        nameMode, 
        prefix, 
        unitPxForFloat, 
        unitMode, 
        colorFormat, 
        baseSize, 
        modesByCollection
      });

      figma.ui.postMessage({
        type: "RESULT",
        payload: {
          css: format.indexOf("css") !== -1 ? css : "",
          tailwind: format.indexOf("tailwind") !== -1 ? tailwind : ""
        }
      });

    } catch (e) {
      console.error("Error en RUN:", e);
      figma.notify("Ocurrió un error al generar el código. Revisa la consola.", { error: true });
    }
  }
};


// --- LÓGICA DE PROCESAMIENTO PRINCIPAL ---

/**
 * Orquesta todo el proceso de generación de código.
 * Itera sobre las variables seleccionadas y organiza la salida.
 */
async function processAndGenerateCode(options: {
  selectedVars: Variable[],
  allCollections: VariableCollection[],
  selectedCollectionIds: Set<string>,
  allVariables: Variable[],
  nameMode: NameMode,
  prefix: string,
  unitPxForFloat: boolean,
  unitMode: "px" | "rem",
  colorFormat: "rgb-raw" | "hex" | "oklch",
  baseSize: number,
  modesByCollection: Record<string, string>
}) {
  const { selectedVars, allCollections, selectedCollectionIds, allVariables, nameMode, prefix, unitPxForFloat, unitMode, colorFormat, baseSize, modesByCollection } = options;

  const catsPerBlock: BlockMap = new Map();
  const blockMeta: Record<string, { collectionName: string; modeName: string; selector: string }> = {};
  const twData: TwData = {
    colors: {}, spacing: {}, borderRadius: {}, borderWidth: {}, fontSize: {},
  lineHeight: {}, letterSpacing: {}, fontWeight: {}, fontFamily: {},
  tokens: {},
  };
  
  const modesMap: Record<string, string[]> = {};
  for (const c of allCollections) {
    if (selectedCollectionIds.has(c.id)) {
      modesMap[c.id] = resolveModesForCollection(c, modesByCollection[c.id]);
    }
  }

  // Group variables by collection for strict ordering
  const varsByCollection: Map<string, Variable[]> = new Map();
  for (const col of allCollections) {
    const colVars = selectedVars.filter(v => v.variableCollectionId === col.id);
    if (colVars.length > 0) {
      varsByCollection.set(col.id, colVars);
    }
  }

  // Iterate collection-by-collection in Figma's original order
  for (const col of allCollections) {
    if (!selectedCollectionIds.has(col.id)) continue;
    const modeIds = modesMap[col.id] || [];

    /**
     * IMPORTANTE: Respetamos estrictamente col.variableIds para mantener el 
     * orden visual (drag-and-drop) definido por el usuario en la UI de Figma.
     */
    for (const varId of col.variableIds) {
      const v = allVariables.find(varObj => varObj.id === varId);
      if (!v) continue;

      for (let mId of modeIds) {
        let rawValue = v.valuesByMode[mId];
        
        if (rawValue === undefined) {
          const fallbackModeId = findFirstDefinedModeId(v, col);
          if (fallbackModeId) {
            mId = fallbackModeId;
            rawValue = v.valuesByMode[mId];
          }
        }
        if (rawValue === undefined) continue;

        const { value: resolvedValue, sourceVar: aliasSourceVar } = await resolveAlias({
          rawValue: rawValue as VariableValue, modeId: mId, allCollections
        });
        if (resolvedValue === null || resolvedValue === undefined) continue;

        // Rule: Extract folders and clean token name
        const nameParts = v.name.split('/').map(s => s.trim()).filter(Boolean);
        nameParts.pop(); // Leaf is the token
        const folderPath = nameParts.length > 0 ? nameParts.join(' / ') : "Root";

        const tokenName = makeTokenName(v, col.name, nameMode);
        const cssVarName = toCssVar(tokenName, prefix).replace(/\n/g, "").trim();
        
        const blockKey = ensureBlock(col, mId, catsPerBlock, blockMeta, modesMap);
        
        let folderMap = catsPerBlock.get(blockKey);
        if (!folderMap) {
          folderMap = new Map();
          catsPerBlock.set(blockKey, folderMap);
        }
        
        if (!folderMap.has(folderPath)) {
          folderMap.set(folderPath, []);
        }

        const out = formatOutputLine({ v, resolvedValue, aliasSourceVar, allCollections, cssVarName, nameMode, prefix, unitPxForFloat, unitMode, colorFormat, baseSize });
        
        // Rule: Extreme cleanup of line breaks and spaces
        if (out.cssLine) {
          const cleanLine = out.cssLine.replace(/\n/g, "").trim();
          folderMap.get(folderPath)!.push(cleanLine);
        }
        
        // Tailwind categorization (unchanged logic)
        const categories = ["Colors", "Spacing", "Typography", "Other"] as const;
        let cat: CategoryKey = "Other";
        if (v.resolvedType === "COLOR") cat = "Colors";
        else if (v.name.toLowerCase().includes("spacing") || v.name.toLowerCase().includes("radius")) cat = "Spacing";
        else if (v.name.toLowerCase().includes("font") || v.name.toLowerCase().includes("text")) cat = "Typography";

        const tailwindValue = (out.tailwindEntry || `var(${cssVarName})`).replace(/\n/g, "").trim();
        assignToTailwindData(twData, cat, folderPath || "General", tokenName, tailwindValue);
      }
    }
  }

  const cssOutput = composeCssOutput(catsPerBlock, blockMeta, modesMap, allCollections);
  const tailwindOutput = composeTailwindOutput(twData);

  return { css: cssOutput, tailwind: tailwindOutput };
}


// --- HELPERS DE FORMATO Y COMPOSICIÓN DE SALIDA ---

/**
 * Formatea una única línea de CSS y una entrada para Tailwind a partir de una variable.
 */
function formatOutputLine(options: {
  v: Variable,
  resolvedValue: VariableValue,
  aliasSourceVar: Variable | undefined,
  allCollections: VariableCollection[],
  cssVarName: string,
  nameMode: NameMode,
  prefix: string,
  unitPxForFloat: boolean,
  unitMode: "px" | "rem",
  colorFormat: "rgb-raw" | "hex" | "oklch",
  baseSize: number
}) {
  const { v, resolvedValue, aliasSourceVar, allCollections, cssVarName, nameMode, prefix, unitPxForFloat, unitMode, colorFormat, baseSize } = options;
  let cssLine: string | null = null;
  let tailwindEntry: string | null = null;
  
  if (aliasSourceVar) {
    const srcCol = allCollections.find(c => c.id === aliasSourceVar.variableCollectionId)!;
    const srcTokenName = makeTokenName(aliasSourceVar, srcCol.name, nameMode);
    const srcCssVarName = toCssVar(srcTokenName, prefix);
    cssLine = `${cssVarName}: var(${srcCssVarName});`;
    // Also create a Tailwind entry so aliases are mapped in the Tailwind output
    if (aliasSourceVar.resolvedType === 'COLOR') {
      // Use resolvedValue to determine if alpha is present
      const aliasedVal = resolvedValue as RGBA | undefined;
      if (aliasedVal && typeof aliasedVal === 'object' && aliasedVal.r !== undefined) {
        tailwindEntry = (aliasedVal.a < 1) ? `rgb(var(${srcCssVarName}) / <alpha-value>)` : `rgb(var(${srcCssVarName}))`;
      } else {
        // fallback: assume opaque to avoid showing empty alpha
        tailwindEntry = `rgb(var(${srcCssVarName}))`;
      }
    } else {
      tailwindEntry = `var(${srcCssVarName})`;
    }
  } else {
    switch (v.resolvedType) {
      case "COLOR": {
        const rgba = resolvedValue as RGBA;
        let colorVal = "";
        
        if (colorFormat === "hex") {
          colorVal = toHex(rgba);
        } else if (colorFormat === "oklch") {
          colorVal = toOKLCH(rgba);
        } else {
          // Default: RGB Raw (r g b)
          colorVal = `${Math.round(rgba.r * 255)} ${Math.round(rgba.g * 255)} ${Math.round(rgba.b * 255)}`;
        }

        cssLine = `${cssVarName}: ${colorVal};`;
        if (rgba.a < 1 && colorFormat !== "oklch" && colorFormat !== "hex") {
           cssLine += ` /* alpha: ${rgba.a.toFixed(2)} */`;
        }
        
        // Tailwind logic: Surgical separation
        // If it's a primitive (no alias), use the raw value. 
        // If it's an alias, it's handled in the alias block above.
        if (colorFormat === "rgb-raw") {
          const r = Math.round(rgba.r * 255);
          const g = Math.round(rgba.g * 255);
          const b = Math.round(rgba.b * 255);
          tailwindEntry = (rgba.a < 1) ? `rgb(${r} ${g} ${b} / ${rgba.a.toFixed(2)})` : `rgb(${r} ${g} ${b})`;
        } else {
          tailwindEntry = colorVal; // Hex or OKLCH
        }
        break;
      }
      case "FLOAT": {
        let val = String(resolvedValue);
        const path = v.name.toLowerCase();
        const isWeight = path.includes("weight");

        if (isWeight && typeof resolvedValue === 'number') {
          val = String(resolvedValue);
        } else if (unitPxForFloat) {
          if (unitMode === "rem") {
            const remVal = (resolvedValue as number) / (baseSize || 16);
            val = `${remVal.toFixed(3).replace(/\.?0+$/, "")}rem`;
          } else {
            val = `${resolvedValue}px`;
          }
        }
        cssLine = `${cssVarName}: ${val};`;
        // Use raw value for primitives in Tailwind
        tailwindEntry = val;
        break;
      }
      case "STRING": {
        cssLine = `${cssVarName}: "${resolvedValue}";`;
        // Use raw value for primitives in Tailwind
        tailwindEntry = String(resolvedValue);
        break;
      }
    }
  }
  return { cssLine, tailwindEntry };
}

/**
 * Asigna una entrada de Tailwind a la categoría correcta dentro del objeto `twData`.
 */
function assignToTailwindData(twData: TwData, category: CategoryKey, subName: string, tokenName: string, tailwindEntry: string) {
  // Use the last segment ONLY for color shade scale (e.g., "primary-500").
  // For all other maps, use the full token name to avoid collisions like "spacing-16" in multiple families.
  const scaleKey = tokenName.split('-').pop() || tokenName;

  if (category === 'Colors') {
    const family = tokenName.substring(0, tokenName.lastIndexOf('-')) || tokenName;
    if (!twData.colors[family]) twData.colors[family] = {};
    twData.colors[family][scaleKey] = tailwindEntry;
    return;
  }

  if (category === 'Spacing') {
    if (subName === 'Space' || subName === 'Spacing') {
      twData.spacing[tokenName] = tailwindEntry;
      return;
    }
    if (subName === 'Radius' || subName === 'Rounded') {
      twData.borderRadius[tokenName] = tailwindEntry;
      return;
    }
    if (subName === 'Border-Width') {
      twData.borderWidth[tokenName] = tailwindEntry;
      return;
    }
  }

  if (category === 'Typography') {
    if (subName === 'Font-Size') {
      twData.fontSize[tokenName] = tailwindEntry;
      return;
    }
    if (subName === 'Line Height') {
      twData.lineHeight[tokenName] = tailwindEntry;
      return;
    }
    if (subName === 'Letter-Spacing') {
      twData.letterSpacing[tokenName] = tailwindEntry;
      return;
    }
    if (subName === 'Weight') {
      twData.fontWeight[tokenName] = tailwindEntry;
      return;
    }
    if (subName === 'Family') {
      twData.fontFamily[tokenName] = tailwindEntry;
      return;
    }
  }

  // Fallback: don't drop unknowns
  if (!twData.tokens) twData.tokens = {};
  twData.tokens[tokenName] = tailwindEntry;
}

/**
 * Construye el string final de CSS usando pre-agrupación por Map para evitar comentarios duplicados.
 */
function composeCssOutput(
    catsPerBlock: BlockMap, 
    blockMeta: Record<string, { collectionName: string; modeName: string; selector: string }>, 
    modesMap: Record<string, string[]>, 
    allCollections: VariableCollection[]
): string {
    const cssChunks: string[] = [];
    
    const modePairs: {col: VariableCollection, modeId: string}[] = [];
    for (const col of allCollections) {
      if (modesMap[col.id]) {
        for (const modeId of modesMap[col.id]) {
          modePairs.push({ col, modeId });
        }
      }
    }

    for (const { col, modeId } of modePairs) {
        const blockKey = `${col.id}::${modeId}`;
        const folderMap = catsPerBlock.get(blockKey);
        if (!folderMap || folderMap.size === 0) continue;
        const meta = blockMeta[blockKey];

        cssChunks.push(`/* --- Collection: ${meta.collectionName} | Mode: ${meta.modeName} --- */\n`);
        cssChunks.push(`${meta.selector} {`);
        
        /**
         * Rule: Agrupación Estricta por Carpeta (Map-based).
         * Esto garantiza que cada carpeta se procese EXACTAMENTE UNA VEZ,
         * uniendo todas sus variables bajo un único encabezado sin duplicados.
         */
        folderMap.forEach((lines, folderName) => {
            if (lines.length === 0) return;
            
            cssChunks.push(`\n  /* --- ${folderName} --- */`);
            lines.forEach(line => {
                cssChunks.push(`  ${line}`);
            });
        });

        cssChunks.push("}\n");
    }
    return cssChunks.join("\n");
}

/**
 * Construye el string final de configuración de Tailwind.
 */
function composeTailwindOutput(twData: TwData): string {
    const segments: string[] = [];

    // Colors
    if (Object.keys(twData.colors).length > 0) {
        const colorFamilies = Object.keys(twData.colors).sort().map(family => {
            const shades = Object.keys(twData.colors[family]).sort((a,b) => {
                const na = Number(a);
                const nb = Number(b);
                const aIsNum = !Number.isNaN(na);
                const bIsNum = !Number.isNaN(nb);
                if (aIsNum && bIsNum) return na - nb;
                if (aIsNum && !bIsNum) return -1;
                if (!aIsNum && bIsNum) return 1;
                return a.localeCompare(b, undefined, { numeric: true });
            }).map(shade => `          "${shade}": "${twData.colors[family][shade]}"`);
            return `        "${family}": {\n${shades.join(',\n')}\n        }`;
        });
        segments.push(`      colors: {\n${colorFamilies.join(',\n')}\n      }`);
    }

    // Simple categories
    const simpleMaps: {[key: string]: Record<string, string>} = {
        spacing: twData.spacing,
        borderRadius: twData.borderRadius,
        borderWidth: twData.borderWidth,
        fontSize: twData.fontSize,
        lineHeight: twData.lineHeight,
        letterSpacing: twData.letterSpacing,
        fontWeight: twData.fontWeight,
        fontFamily: twData.fontFamily,
    };

    for (const key in simpleMaps) {
        const data = simpleMaps[key];
        if (Object.keys(data).length > 0) {
            const sortedEntries = Object.keys(data).map(k => [k, data[k]]).sort(([a], [b]) => (a as string).localeCompare(b as string, undefined, { numeric: true }));
            const lines = sortedEntries.map(([k, v]) => `        "${k}": "${v}"`);
            segments.push(`      ${key}: {\n${lines.join(',\n')}\n      }`);
        }
    }

    // Tokens / Other
    if (twData.tokens && Object.keys(twData.tokens).length > 0) {
        const tokenEntries = Object.keys(twData.tokens).sort().map(k => `        "${k}": "${twData.tokens![k]}"`);
        segments.push(`      tokens: {\n${tokenEntries.join(',\n')}\n      }`);
    }

    return `// tailwind.config.js
module.exports = {
  theme: {
    extend: {
${segments.join(',\n')}
    }
  }
};`;
}


// --- HELPERS Y UTILIDADES VARIAS ---

/**
 * Convierte un string a formato kebab-case de forma segura.
 */
function kebab(s: unknown): string {
  const str = String(s || '').trim();
  if (!str) return '';
  return str.replace(/[/\\]/g, "-").replace(/\s+/g, "-").replace(/[_]+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").replace(/--+/g, "-").toLowerCase();
}

/**
 * Crea el nombre de una variable CSS (ej. --prefix-mi-token).
 */
function toCssVar(name: string, pfx: string): string {
  const n = pfx ? `${pfx}-${name}` : name;
  return `--${n}`;
}

function toHex(rgba: RGBA): string {
  const r = Math.round(rgba.r * 255).toString(16).padStart(2, "0");
  const g = Math.round(rgba.g * 255).toString(16).padStart(2, "0");
  const b = Math.round(rgba.b * 255).toString(16).padStart(2, "0");
  const a = rgba.a < 1 ? Math.round(rgba.a * 255).toString(16).padStart(2, "0") : "";
  return `#${r}${g}${b}${a}`;
}

/**
 * Convierte RGB a OKLCH (Simplificado para CSS)
 * L: 0-1, C: 0-0.4, H: 0-360
 */
function toOKLCH(rgba: RGBA): string {
  // Conversión simplificada oklch directa desde RGB
  // Para una precisión absoluta se requeriría una matriz de transformación a XYZ
  // pero para CSS este formato es suficiente con valores base.
  const r = rgba.r;
  const g = rgba.g;
  const b = rgba.b;
  
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const b_ = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.sqrt(a * a + b_ * b_);
  const H = (Math.atan2(b_, a) * 180) / Math.PI;
  const finalH = H >= 0 ? H : H + 360;

  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${finalH.toFixed(1)}${rgba.a < 1 ? ` / ${rgba.a.toFixed(2)}` : ""})`;
}

/**
 * Genera el nombre del token basado en el nombre completo de la variable en Figma.
 */
function makeTokenName(v: Variable, collectionName: string, nameMode: NameMode): string {
  if (nameMode === "code-syntax") {
    const meta = v as VariableWithCodeSyntax;
    const candidates = [meta.codeSyntax, meta.code_syntax, meta.codeName, meta.nameForCode, meta.nameForCodeSyntax];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim().length > 0) {
        return kebab(c.replace(/^--+/, ""));
      }
    }
  }
  return kebab(v.name || '');
}

/**
 * Resuelve qué modos deben ser procesados para una colección.
 */
function resolveModesForCollection(col: VariableCollection, requestedModes?: string): string[] {
  if (requestedModes) {
    const req = requestedModes.trim();
    if (req === "ALL" || req === "*") return col.modes.map(m => m.modeId);
    return req.split(',').map(s => s.trim()).filter(id => col.modes.some(m => m.modeId === id));
  }
  return col.modes.map(m => m.modeId);
}

/**
 * Encuentra el primer modo de una variable que tiene un valor definido.
 */
function findFirstDefinedModeId(v: Variable, col: VariableCollection): string | null {
  for (const mode of col.modes) {
    if (v.valuesByMode[mode.modeId] !== undefined) return mode.modeId;
  }
  return null;
}

/**
 * Resuelve recursivamente una variable de tipo alias hasta encontrar un valor concreto.
 * Incluye una salvaguarda para evitar bucles infinitos.
 */
async function resolveAlias(options: { rawValue: VariableValue, modeId: string, allCollections: VariableCollection[], depth?: number }): Promise<{ value: VariableValue, sourceVar?: Variable }> {
  const { rawValue, modeId, allCollections, depth = 0 } = options;
  
  // Salvaguarda contra bucles infinitos en alias
  if (depth > 10) {
    console.error("Alias resolution depth exceeded. Check for circular references.");
    return { value: rawValue };
  }

  const rawAsObj = rawValue as {type?: string, id?: string};
  if (typeof rawValue === 'object' && rawAsObj.type === 'VARIABLE_ALIAS') {
    const aliasId = rawAsObj.id;
    if (aliasId) {
      const sourceVar = await figma.variables.getVariableByIdAsync(aliasId);
      if (sourceVar) {
        let value = sourceVar.valuesByMode[modeId];
        if (value === undefined) {
          const sourceCol = allCollections.find(c => c.id === sourceVar.variableCollectionId)!;
          const fallbackModeId = findFirstDefinedModeId(sourceVar, sourceCol);
          if (fallbackModeId) value = sourceVar.valuesByMode[fallbackModeId];
        }
        if (value !== undefined) {
          const nestedResolution = await resolveAlias({ rawValue: value, modeId, allCollections, depth: depth + 1 });
          return { value: nestedResolution.value, sourceVar: sourceVar };
        }
      }
    }
  }
  return { value: rawValue };
}

/**
 * Se asegura de que exista una entrada en la estructura de datos para una combinación de colección/modo.
 */
function ensureBlock(
    col: VariableCollection, 
    modeId: string, 
    catsPerBlock: BlockMap, 
    blockMeta: Record<string, { collectionName: string; modeName: string; selector: string }>, 
    modesMap: Record<string, string[]>
) {
  const key = `${col.id}::${modeId}`;
  if (catsPerBlock.has(key)) return key;

  const folderMap: FolderMap = new Map();
  catsPerBlock.set(key, folderMap);
  
  const modeName = col.modes.find(m => m.modeId === modeId)?.name || modeId;
  const totalModesForCol = modesMap[col.id]?.length || 0;

  // Dynamic Theming: Use data-theme attribute selector for modes
  let selector = ":root";
  const modeKebab = kebab(modeName);
  
  if (totalModesForCol > 1) {
    if (modeKebab === "light" || modeKebab === "claro") {
      selector = ":root"; 
    } else {
      selector = `[data-theme="${modeKebab}"]`;
    }
  }
  
  blockMeta[key] = { collectionName: col.name, modeName, selector };
  return key;
}
