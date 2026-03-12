// =================================================================
// code.ts (Final, Documentado y Optimizado)
// =================================================================

// Muestra la interfaz del plugin con el tamaño especificado
figma.showUI(__html__, { width: 820, height: 900 });

// --- TIPOS GLOBALES Y ESTRUCTURAS DE DATOS ---

type ExportFormat = "css" | "tailwind" | "excel";
type NameMode = "code-syntax" | "figma-name";
type CategoryKey = "Colors" | "Spacing" | "Typography" | "Other";

interface UIRequest {
  type: "INIT" | "RUN";
  payload?: {
    collectionIds?: string[];
    nameMode?: NameMode;
    format?: ExportFormat[];
    unitPxForFloat?: boolean;
    useRem?: boolean;
    colorFormat?: "hex" | "rgb" | "hsl" | "oklch";
    prefix?: string;
    modesByCollection?: Record<string, string>;
  };
}



// Estructura para organizar los datos que se enviarán a la configuración de Tailwind
interface TwEntry {
  target: string;
  key: string;
  family?: string;
  value: string;
  segments: string[];
  collection: string;
  order: number;
}

// Estructuras de datos para organizar las líneas de CSS antes de generarlas
type Line = { 
  name: string; 
  text: string; 
  tw?: {
    target: string;
    key: string;
    family?: string;
    value: string;
  };
  order?: number; 
};
type FolderNode = {
  lines: Line[];
  subFolders: Record<string, FolderNode>;
};
function createFolderNode(): FolderNode { return { lines: [], subFolders: {} }; }

// Custom interface strictly for Excel metadata lines
interface ExcelLine {
  figmaPath: string;
  figmaValueString: string;
  codeSyntax: string;
  codeValue: string;
  order?: number;
  name: string;
}
interface ExcelFolderNode {
  subFolders: Record<string, ExcelFolderNode>;
  lines: ExcelLine[];
}


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
        useRem = false,
        colorFormat = "hex",
        prefix = "",
        modesByCollection = {}
      } = msg.payload || {};

      const allCollections = await figma.variables.getLocalVariableCollectionsAsync();
      const allVariables = await figma.variables.getLocalVariablesAsync();

      const selectedCollectionIds = (collectionIds && collectionIds.length)
        ? new Set(collectionIds)
        : new Set(allCollections.map(c => c.id));
      
      const selectedVars = allVariables.filter(v => selectedCollectionIds.has(v.variableCollectionId));

      const { css, tailwind, excel } = await processAndGenerateCode({
        selectedVars, allCollections, nameMode, prefix, unitPxForFloat, useRem, colorFormat, modesByCollection
      });

      figma.ui.postMessage({
        type: "RESULT",
        payload: {
          css: format.indexOf("css") !== -1 ? css : "",
          tailwind: format.indexOf("tailwind") !== -1 ? tailwind : "",
          excel: format.indexOf("excel") !== -1 ? excel : ""
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
  nameMode: NameMode,
  prefix: string,
  unitPxForFloat: boolean,
  useRem: boolean,
  colorFormat: "hex" | "rgb" | "hsl" | "oklch",
  modesByCollection: Record<string, string>
}) {
  const { selectedVars, allCollections, nameMode, prefix, unitPxForFloat, useRem, colorFormat, modesByCollection } = options;

  const rootPerBlock: Record<string, FolderNode> = {};
  const blockMeta: Record<string, { collectionName: string; modeName: string; selector: string }> = {};
  const allTwEntries: TwEntry[] = [];
  const processedForTw = new Set<string>();
  const collectionOrder: string[] = [];
  const rootExcelBlock: Record<string, ExcelFolderNode> = {};
  
  const modesMap: Record<string, string[]> = {};
  for (const c of allCollections) {
    if (selectedVars.some(v => v.variableCollectionId === c.id)) {
      modesMap[c.id] = resolveModesForCollection(c, modesByCollection[c.id]);
    }
  }

  for (const v of selectedVars) {
    const col = allCollections.find(c => c.id === v.variableCollectionId)!;
    const modeIds = modesMap[col.id] || [];

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

      const tokenName = makeTokenName(v, col.name, nameMode);
      const cssVarName = toCssVar(tokenName, prefix);
      const { category, subName } = classifyVariable(v, col, nameMode, tokenName);
      
      const blockKey = ensureBlock(col, mId, rootPerBlock, blockMeta, modesMap);
      
      const out = formatOutputLine({ v, resolvedValue, aliasSourceVar, allCollections, cssVarName, nameMode, prefix, unitPxForFloat, useRem, colorFormat, category, subName });
  const cssLine = out.cssLine;
  const tailwindEntry = out.tailwindEntry;

      if (cssLine) {
        const originalIndex = selectedVars.indexOf(v);
        const segments = (v.name || '').split('/').map(s => s.trim()).filter(Boolean);
        let currentNode = rootPerBlock[blockKey];
        let cvExcelNode: ExcelFolderNode = rootExcelBlock[blockKey] || (rootExcelBlock[blockKey] = { subFolders: {}, lines: [] });
                
        for (let i = 0; i < segments.length - 1; i++) {
          const seg = segments[i];
          if (!currentNode.subFolders[seg]) currentNode.subFolders[seg] = createFolderNode();
          currentNode = currentNode.subFolders[seg];
          
          if (!cvExcelNode.subFolders[seg]) cvExcelNode.subFolders[seg] = { subFolders: {}, lines: [] };
          cvExcelNode = cvExcelNode.subFolders[seg];
        }
        currentNode.lines.push({ name: tokenName, text: cssLine, order: originalIndex });
        
        let cvCodeValue = "";
        let figmaValueString = "";
        
        if (aliasSourceVar) {
             const srcCol = allCollections.find(c => c.id === aliasSourceVar.variableCollectionId)!;
             figmaValueString = `${srcCol.name}/${aliasSourceVar.name}`;
             const srcTokenName = makeTokenName(aliasSourceVar, srcCol.name, nameMode);
             cvCodeValue = `var(${toCssVar(srcTokenName, prefix)})`;
        } else {
            figmaValueString = out.rawFigmaValue || cssLine.split(":")[1].replace(";", "").trim();
            cvCodeValue = cssLine.split(":")[1].replace(";", "").trim();
        }

        cvExcelNode.lines.push({
            figmaPath: `${col.name}/${v.name}`,
            figmaValueString,
            codeSyntax: cssVarName,
            codeValue: cvCodeValue,
            order: originalIndex,
            name: tokenName
        });
      }
      
      // Tailwind: Only collect ONCE per token (from the first mode) using the hierarchical context
      if (mId === modeIds[0] && !processedForTw.has(v.id)) {
        processedForTw.add(v.id);
        if (collectionOrder.indexOf(col.name) === -1) collectionOrder.push(col.name);
        
        const finalTwEntry = tailwindEntry || `var(${cssVarName})`;
        const info = getTailwindInfo(category, subName, tokenName, finalTwEntry);
        
        if (info) {
          const segments = (v.name || '').split('/').map(s => s.trim()).filter(Boolean);
          allTwEntries.push({
            ...info,
            segments,
            collection: col.name,
            order: selectedVars.indexOf(v)
          });
        }
      }
    }
  }

  const cssOutput = composeCssOutput(rootPerBlock, blockMeta, modesMap, allCollections);
  const tailwindOutput = composeTailwindOutput(allTwEntries, collectionOrder);
  const excelOutput = composeExcelOutput(rootExcelBlock, blockMeta, modesMap, allCollections);

  return { css: cssOutput, tailwind: tailwindOutput, excel: excelOutput };
}


// --- FUNCIONES DE CLASIFICACIÓN Y ORGANIZACIÓN ---

/**
 * Clasifica una variable en una categoría y subgrupo para organizar el CSS.
 */
function classifyVariable(v: Variable, col: VariableCollection, nameMode: NameMode, tokenName: string) {
  let category: CategoryKey;
  let subName = "General";

  if (nameMode === "code-syntax") {
    const fromSyntax = classifyByTokenName(tokenName, v.resolvedType);
    if (fromSyntax) return fromSyntax;
  }
  
  const path = `${col.name}/${v.name}`.toLowerCase();
  if (v.resolvedType === "COLOR") category = "Colors";
  else if (path.indexOf("font") !== -1 || path.indexOf("text") !== -1) category = "Typography";
  else if (path.indexOf("space") !== -1 || path.indexOf("radius") !== -1 || path.indexOf("size") !== -1) category = "Spacing";
  else category = "Other";

  if (category === "Colors") subName = getFirstMeaningfulSegment(v, col.name);
  if (category === "Spacing") subName = getSpacingSubgroup(path);
  if (category === "Typography") subName = getTypographySubgroup(path);
  
  return { category, subName };
}

function classifyByTokenName(tokenName: string, resolvedType: VariableResolvedDataType): { category: CategoryKey; subName: string } | null {
  const parts = tokenName.split('-');
  const first = parts[0];
  const whole = tokenName;
  const norm = whole.replace(/[\s_-]/g, '').toLowerCase();
  const lastPart = parts[parts.length - 1].toLowerCase();

  // Line height — detect BEFORE the general Typography check since "lineheight" doesn't contain "font" or "text"
  if (first === 'lineheight' || norm.includes('lineheight')) {
    return { category: 'Typography', subName: 'Line Height' };
  }

  // Known font weight names
  const weightNames = new Set(['thin', 'extralight', 'light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black']);

  // Typography family
  if (first === 'typography' || norm.includes('font') || norm.includes('text')) {
    // IMPORTANT: if the resolved type is COLOR, these are text COLOR tokens (e.g. text-accent-default),
    // NOT font sizes. Route to Colors instead.
    if (resolvedType === 'COLOR') {
      return { category: 'Colors', subName: first.charAt(0).toUpperCase() + first.slice(1) };
    }

    if (norm.includes('size')) return { category: 'Typography', subName: 'Font-Size' };
    if (norm.includes('lineheight')) return { category: 'Typography', subName: 'Line Height' };
    if (norm.includes('letterspacing') || norm.includes('tracking')) return { category: 'Typography', subName: 'Letter-Spacing' };
    if (norm.includes('weight')) return { category: 'Typography', subName: 'Weight' };
    if (norm.includes('family')) return { category: 'Typography', subName: 'Family' };

    // text-sm, text-lg, text-2xl, text-base → font sizes (only FLOAT values reach here)
    if (first === 'text') return { category: 'Typography', subName: 'Font-Size' };

    // font-bold, font-semibold, font-thin, etc. → font weights by name
    if (first === 'font' && weightNames.has(lastPart)) {
      return { category: 'Typography', subName: 'Weight' };
    }
    // font-inter, font-amx → string values are font families
    if (first === 'font' && resolvedType === 'STRING') {
      return { category: 'Typography', subName: 'Family' };
    }
    // font-* with float values that aren't known weight names → still likely weights
    if (first === 'font' && resolvedType === 'FLOAT') {
      return { category: 'Typography', subName: 'Weight' };
    }

    return { category: 'Typography', subName: 'General' };
  }

  // Spacing family (space, radius, border width, padding, margin, gap)
  if (first === 'size' || first === 'spacing' || first === 'p' || first === 'm' || first === 'gap'
      || norm.includes('space') || norm.includes('spacing') || norm.includes('gap')
      || norm.includes('radius') || norm.includes('rounded')
      || norm.includes('padding') || norm.includes('margin')) {
    if (norm.includes('radius') || norm.includes('rounded')) return { category: 'Spacing', subName: 'Radius' };
    if (norm.includes('borderwidth') || (norm.includes('border') && (norm.includes('width') || norm.includes('size'))) || norm.includes('strokewidth')) {
      return { category: 'Spacing', subName: 'Border-Width' };
    }
    return { category: 'Spacing', subName: 'Space' };
  }

  // Colors (default fallback for color type)
  if (resolvedType === 'COLOR') {
    return { category: 'Colors', subName: first.charAt(0).toUpperCase() + first.slice(1) };
  }

  return null;
}

function getSpacingSubgroup(path: string): string {
  const p = path.toLowerCase();
  // explicit border/stroke width detection
  if (p.includes("border-width") || (p.includes("border") && (p.includes("width") || p.includes("size"))) || p.includes("stroke-width") || (p.includes("stroke") && p.includes("width"))) {
    return "Border-Width";
  }
  if (p.includes("radius") || p.includes("rounded")) return "Radius";
  if (p.includes("space") || p.includes("spacing") || p.includes("gap") || p.includes("padding") || p.includes("margin")) return "Space";
  return "Spacing";
}

function getTypographySubgroup(path: string): string {
  const p = path.toLowerCase();
  const norm = p.replace(/[\s_-]/g, ""); // normalize camel/snake/kebab
  if (norm.includes("family")) return "Family";
  if (norm.includes("weight")) return "Weight";
  if (norm.includes("lineheight")) return "Line Height";
  if (norm.includes("letterspacing") || norm.includes("tracking")) return "Letter-Spacing";
  if (norm.includes("fontsize") || (norm.includes("size") && norm.includes("font"))) return "Font-Size";
  return "Typography";
}

function getFirstMeaningfulSegment(v: Variable, collectionName: string): string {
  const segments = getCleanedPathSegments(v, collectionName);
  return segments[0] || "General";
}

function getCleanedPathSegments(v: Variable, collectionName: string): string[] {
  const rawSegments = (v.name || "").split("/").map(s => s.trim()).filter(Boolean);
  const genericTerms = new Set(["color", "colors", "primitive", "primitives", "semantic", "semantics", collectionName.toLowerCase()]);
  return rawSegments.filter(s => !genericTerms.has(s.toLowerCase()));
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
  useRem: boolean,
  colorFormat: "hex" | "rgb" | "hsl" | "oklch",
  category: CategoryKey,
  subName: string
}) {
  const { v, resolvedValue, aliasSourceVar, allCollections, cssVarName, nameMode, prefix, unitPxForFloat, useRem, colorFormat, category, subName } = options;
  let cssLine: string | null = null;
  let tailwindEntry: string | null = null;
  let rawFigmaValue: string | null = null;

  // Helper: RGBA to specified format
  function formatColor(rgba: RGBA): string {
    const { r, g, b, a } = rgba;
    const R = Math.round(r * 255);
    const G = Math.round(g * 255);
    const B = Math.round(b * 255);

    switch (colorFormat) {
      case "rgb":
        return a < 1 ? `rgb(${R} ${G} ${B} / ${Math.round(a * 100)}%)` : `rgb(${R} ${G} ${B})`;
      case "hsl": {
        const hsf = rgbToHsl(r, g, b);
        const h = Math.round(hsf.h);
        const s = Math.round(hsf.s * 100);
        const l = Math.round(hsf.l * 100);
        return a < 1 ? `hsl(${h} ${s}% ${l}% / ${Math.round(a * 100)}%)` : `hsl(${h} ${s}% ${l}%)`;
      }
      case "oklch": {
        const oklch = rgbToOklch(r, g, b);
        const l = oklch.l.toFixed(3);
        const c = oklch.c.toFixed(3);
        const h = Math.round(oklch.h);
        return a < 1 ? `oklch(${l} ${c} ${h} / ${Math.round(a * 100)}%)` : `oklch(${l} ${c} ${h})`;
      }
      case "hex":
      default: {
        let hex = "#" + [R, G, B].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
        if (a < 1) hex += Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase();
        return hex;
      }
    }
  }

  if (aliasSourceVar) {
    // --- ALIAS: CSS uses var(--ref), Tailwind ALSO references the primitive token ---
    const srcCol = allCollections.find(c => c.id === aliasSourceVar.variableCollectionId)!;
    const srcTokenName = makeTokenName(aliasSourceVar, srcCol.name, nameMode);
    const srcCssVarName = toCssVar(srcTokenName, prefix);
    cssLine = `${cssVarName}: var(${srcCssVarName});`;

    // Semantic tokens reference primitives — keep the indirection
    tailwindEntry = `var(${srcCssVarName})`;
  } else {
    // --- PRIMITIVE: CSS uses HEX, Tailwind uses the same cooked value ---
    switch (v.resolvedType) {
      case "COLOR": {
        const rgba = resolvedValue as RGBA;
        const colorVal = formatColor(rgba);
        rawFigmaValue = colorVal;
        cssLine = `${cssVarName}: ${colorVal};`;
        tailwindEntry = colorVal;
        break;
      }
      case "FLOAT": {
        let val = String(resolvedValue);
        // Font weights are unitless - ensure we don't add "px" even if unitPxForFloat is true
        const isWeight = (category === 'Typography' && subName === 'Weight');
        
        if (!isWeight) {
          if (useRem) {
            val = `${(resolvedValue as number) / 16}rem`;
          } else if (unitPxForFloat) {
            val = `${resolvedValue}px`;
          }
        }
        
        rawFigmaValue = String(resolvedValue);
        cssLine = `${cssVarName}: ${val};`;
        tailwindEntry = val;
        break;
      }
      case "STRING": {
        rawFigmaValue = String(resolvedValue);
        cssLine = `${cssVarName}: "${resolvedValue}";`;
        tailwindEntry = String(resolvedValue);
        break;
      }
    }
  }
  return { cssLine, tailwindEntry, rawFigmaValue };
}

/**
 * Helper: Strip prefixes to avoid class redundancy like "spacing-spacing-1"
 */
function stripPrefix(name: string, pfxs: string[]): string {
  const lower = name.toLowerCase();
  for (const p of pfxs) {
    if (lower.startsWith(p + '-')) return name.substring(p.length + 1);
  }
  return name;
}

/**
 * Asigna una entrada de Tailwind a la categoría correcta dentro del objeto `twData`.
 */
/**
 * Determina la información de Tailwind para una variable.
 */
function getTailwindInfo(
  category: CategoryKey, 
  subName: string, 
  tokenName: string, 
  tailwindEntry: string
): { target: string; key: string; family?: string; value: string } | null {
  const norm = tokenName.toLowerCase();

  // Color families handling
  if (category === 'Colors') {
    const family = tokenName.substring(0, tokenName.lastIndexOf('-')) || tokenName;
    const scaleKey = tokenName.split('-').pop() || tokenName;
    return { target: 'colors', family, key: scaleKey, value: tailwindEntry };
  }

  // Smart routing & Prefix stripping
  let finalKey = tokenName;
  let target = "";

  if (norm.startsWith('blur')) {
    finalKey = stripPrefix(tokenName, ['blur']);
    target = "blur";
  } else if (norm.startsWith('opacity')) {
    finalKey = stripPrefix(tokenName, ['opacity']);
    target = "opacity";
  } else if (norm.startsWith('shadow') || norm.startsWith('drop-shadow')) {
    finalKey = stripPrefix(tokenName, ['shadow', 'drop-shadow']);
    target = "boxShadow";
  } else if (norm.startsWith('stroke')) {
    finalKey = stripPrefix(tokenName, ['stroke', 'strokewidth']);
    target = "strokeWidth";
  } else if (category === 'Spacing') {
    finalKey = stripPrefix(tokenName, ['spacing', 'space', 'gap', 'p', 'm', 'margin', 'padding', 'radius', 'rounded']);
    if (subName === 'Space' || subName === 'Spacing') target = "spacing";
    else if (subName === 'Radius' || subName === 'Rounded') target = "borderRadius";
    else if (subName === 'Border-Width') target = "borderWidth";
  } else if (category === 'Typography') {
    if (subName === 'Font-Size') {
      finalKey = stripPrefix(tokenName, ['text', 'font', 'size']);
      target = "fontSize";
    } else if (subName === 'Line Height') {
      finalKey = stripPrefix(tokenName, ['lineheight', 'leading']);
      target = "lineHeight";
    } else if (subName === 'Letter-Spacing') {
      finalKey = stripPrefix(tokenName, ['tracking']);
      target = "letterSpacing";
    } else if (subName === 'Weight') {
      finalKey = stripPrefix(tokenName, ['font', 'weight']);
      return { target: "fontWeight", key: finalKey, value: tailwindEntry.replace(/px$/, '') };
    } else if (subName === 'Family') {
      finalKey = stripPrefix(tokenName, ['font', 'family']);
      target = "fontFamily";
    }
  }

  if (target) {
    return { target, key: finalKey, value: tailwindEntry };
  }
  
  return { target: "tokens", key: tokenName, value: tailwindEntry };
}

/**
 * Construye el string final de CSS a partir de los datos organizados.
 */
function composeCssOutput(
    rootPerBlock: Record<string, FolderNode>, 
    blockMeta: Record<string, { collectionName: string; modeName: string; selector: string }>, 
    modesMap: Record<string, string[]>, 
    allCollections: VariableCollection[]
): string {
    const cssChunks: string[] = [];
    
    const modePairs = Object.keys(modesMap).reduce((acc: {col: VariableCollection, modeId: string}[], colId: string) => {
        const col = allCollections.find(c => c.id === colId)!;
        const pairs = modesMap[colId].map(modeId => ({ col, modeId }));
        return acc.concat(pairs);
    }, []);

    for (const { col, modeId } of modePairs) {
        const blockKey = `${col.id}::${modeId}`;
        const rootNode = rootPerBlock[blockKey];
        if (!rootNode) continue;
        const meta = blockMeta[blockKey];

        cssChunks.push(`/* --- Collection: ${meta.collectionName} | Mode: ${meta.modeName} --- */`);
        cssChunks.push(`${meta.selector} {`);
        
        cssChunks.push(...renderFolderNode(rootNode, 1, ''));
        
        cssChunks.push("}\n");
    }
    return cssChunks.join("\n");
}

function renderFolderNode(node: FolderNode, level: number, parentLabel: string): string[] {
    const chunks: string[] = [];
    
    const lines = node.lines.slice().sort((a, b) => {
      const ra = getSortRank(a.name);
      const rb = getSortRank(b.name);
      if (ra.group === rb.group && ra.type !== 'other') {
        return ra.val - rb.val;
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });

    for (const l of lines) {
      chunks.push(`  ${l.text}`);
    }

    const subNames = Object.keys(node.subFolders); 
    for (const name of subNames) {
      if (chunks.length > 0 && chunks[chunks.length - 1] !== "") chunks.push("");
      
      // Level 1: /* === Color === */
      // Level 2: /* --- Success --- */
      // Level 3+: /* Success Action */  (accumulates parent context)
      let comment: string;
      let nextLabel: string;
      if (level === 1) {
        comment = `/* === ${name} === */`;
        nextLabel = '';
      } else if (level === 2) {
        comment = `/* --- ${name} --- */`;
        nextLabel = name;
      } else {
        const fullLabel = parentLabel ? `${parentLabel} ${name}` : name;
        comment = `/* ${fullLabel} */`;
        nextLabel = fullLabel;
      }
      
      chunks.push(`  ${comment}`);
      chunks.push(...renderFolderNode(node.subFolders[name], level + 1, nextLabel));
    }

    while(chunks.length > 0 && chunks[chunks.length - 1] === "") {
        chunks.pop();
    }

    return chunks;
}

function composeExcelOutput(
    rootExcelBlock: Record<string, ExcelFolderNode>, 
    blockMeta: Record<string, { collectionName: string; modeName: string; selector: string }>, 
    modesMap: Record<string, string[]>, 
    allCollections: VariableCollection[]
): string {
    const csvChunks: string[] = [];
    csvChunks.push("Figma Path,Figma Value,Code Name,Code Value");
    
    // We reuse the mode logic
    const modePairs = Object.keys(modesMap).reduce((acc: {col: VariableCollection, modeId: string}[], colId: string) => {
        const col = allCollections.find(c => c.id === colId)!;
        const pairs = modesMap[colId].map(modeId => ({ col, modeId }));
        return acc.concat(pairs);
    }, []);

    for (const { col, modeId } of modePairs) {
        const blockKey = `${col.id}::${modeId}`;
        const rootNode = rootExcelBlock[blockKey];
        if (!rootNode) continue;
        const meta = blockMeta[blockKey];

        // Section header
        csvChunks.push(`\n"--- ${meta.collectionName} | ${meta.modeName} ---","","",""`);
        
        csvChunks.push(...renderExcelNode(rootNode));
    }
    return csvChunks.join("\n");
}

function renderExcelNode(node: ExcelFolderNode, level: number = 1): string[] {
    const chunks: string[] = [];

    // 1. First, process lines in this folder
    const sortedLines = node.lines.slice().sort((a: ExcelLine, b: ExcelLine) => {
      const ra = getSortRank(a.name);
      const rb = getSortRank(b.name);
      if (ra.group === rb.group && ra.type !== 'other') return ra.val - rb.val;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });

    for (const l of sortedLines) {
      chunks.push(`"${l.figmaPath}","${l.figmaValueString}","${l.codeSyntax}","${l.codeValue}"`);
    }

    // 2. Then, process subfolders
    const subNames = Object.keys(node.subFolders);
    for (const name of subNames) {
      // Add an empty line before a new folder section for readability
      if (chunks.length > 0 && chunks[chunks.length - 1] !== "") {
        chunks.push("");
      }
      
      // The folder name as a header row
      chunks.push(`"${name}","","",""`);
      
      // Recurse
      chunks.push(...renderExcelNode(node.subFolders[name], level + 1));
    }
    
    // Clean up trailing empty strings
    while(chunks.length > 0 && chunks[chunks.length - 1] === "") {
        chunks.pop();
    }
    
    return chunks;
}

/**
 * Construye el string final de configuración de Tailwind.
 */
function joinWithSmartCommas(lines: string[]): string {
  const cleanLines = lines.map(l => l.trimEnd()).filter(l => l.length > 0);
  return cleanLines.map((line, idx) => {
    const trimmed = line.trim();
    const isComment = trimmed.startsWith('//');
    if (isComment) return line;
    
    // If it's the last line of the collection, no comma
    if (idx === cleanLines.length - 1) return line;
    
    // If NEXT line is a comment, we still need a comma for the current valid line
    // but the COMMENT itself won't get one.
    return line + ',';
  }).join('\n');
}

function composeTailwindOutput(
    allTwEntries: TwEntry[],
    collectionOrder: string[]
): string {
    const sections: string[] = [];

    const TARGETS = [
      'colors', 'spacing', 'borderRadius', 'borderWidth', 'fontSize', 
      'lineHeight', 'letterSpacing', 'fontWeight', 'fontFamily', 
      'blur', 'opacity', 'boxShadow', 'strokeWidth', 'tokens'
    ];

    for (const target of TARGETS) {
      const targetEntries = allTwEntries.filter(e => e.target === target);
      if (targetEntries.length === 0) continue;

      const categoryLines: string[] = [];
      
      for (const colName of collectionOrder) {
        const colEntries = targetEntries.filter(e => e.collection === colName);
        if (colEntries.length === 0) continue;

        // Header for collection
        categoryLines.push(`        // --- ${colName} ---`);

        // Group by hierarchy and then by families (only for colors)
        if (target === 'colors') {
          categoryLines.push(...renderColorHierarchy(colEntries));
        } else {
          categoryLines.push(...renderHierarchy(colEntries));
        }
      }

      sections.push(`      ${target}: {\n${joinWithSmartCommas(categoryLines)}\n      }`);
    }

    return `// tailwind.config.js
module.exports = {
  theme: {
    extend: {
${sections.join(',\n')}
    }
  }
};`;
}

/**
 * Renders a list of entries with hierarchical comments.
 */
function renderHierarchy(entries: TwEntry[]): string[] {
  const chunks: string[] = [];
  const sorted = entries.slice().sort((a,b) => {
    const sa = a.segments.join('/');
    const sb = b.segments.join('/');
    if (sa !== sb) return sa.localeCompare(sb);
    return a.order - b.order;
  });

  let lastSegments: string[] = [];

  for (const entry of sorted) {
    const segs = entry.segments.slice(0, -1);
    for (let i = 0; i < segs.length; i++) {
       if (i >= lastSegments.length || segs[i] !== lastSegments[i]) {
          const generic = new Set(['color', 'colors', 'primitive', 'primitives', 'semantic', 'semantics']);
          if (!generic.has(segs[i].toLowerCase())) {
            chunks.push(`        // --- ${segs[i]} ---`);
          }
       }
    }
    lastSegments = segs;
    chunks.push(`        "${entry.key}": "${entry.value}"`);
  }
  return chunks;
}

/**
 * Renders colors with families as objects and higher folders as comments.
 */
function renderColorHierarchy(entries: TwEntry[]): string[] {
  const chunks: string[] = [];
  
  // Sort entries by path first to ensure hierarchical comments are grouped correctly
  const sortedEntries = entries.slice().sort((a,b) => {
    const sa = a.segments.join('/');
    const sb = b.segments.join('/');
    if (sa !== sb) return sa.localeCompare(sb);
    return a.order - b.order;
  });

  // Group by family
  const familyMap: Record<string, TwEntry[]> = {};
  const families: string[] = [];
  
  for (const e of sortedEntries) {
    const f = e.family || e.key;
    if (!familyMap[f]) {
       familyMap[f] = [];
       families.push(f);
    }
    familyMap[f].push(e);
  }

  let lastSegments: string[] = [];

  for (const f of families) {
    const fEntries = familyMap[f];
    const first = fEntries[0];
    const segs = first.segments.slice(0, -1);

    for (let i = 0; i < segs.length; i++) {
      if (i >= lastSegments.length || segs[i] !== lastSegments[i]) {
         const generic = new Set(['color', 'colors', 'primitive', 'primitives', 'semantic', 'semantics']);
         if (!generic.has(segs[i].toLowerCase())) {
            chunks.push(`        // --- ${segs[i]} ---`);
         }
      }
    }
    lastSegments = segs;

    if (fEntries.length === 1 && fEntries[0].key === f) {
       chunks.push(`        "${f}": "${fEntries[0].value}"`);
    } else {
       const shades = fEntries.sort((a,b) => {
         const na = Number(a.key); const nb = Number(b.key);
         if (!isNaN(na) && !isNaN(nb)) return na - nb;
         return a.key.localeCompare(b.key, undefined, { numeric: true });
       }).map(e => `          "${e.key}": "${e.value}"`);
       
       chunks.push(`        "${f}": {\n${joinWithSmartCommas(shades)}\n        }`);
    }
  }
  return chunks;
}

// --- HELPERS Y UTILIDADES VARIAS ---
const SIZE_WEIGHTS: Record<string, number> = {
  'none': 0, '2xs': 5, 'xs': 10, 'sm': 20, 'base': 30, 'default': 31, 'normal': 32,
  'md': 40, 'lg': 50, 'xl': 60, '2xl': 70, '3xl': 80, '4xl': 90, '5xl': 100, '6xl': 110,
  '7xl': 120, '8xl': 130, '9xl': 140, 'full': 999,
  // Font weights for proper sorting
  'thin': 100, 'extralight': 200, 'light': 300, 'regular': 400, 'medium': 500, 
  'semibold': 600, 'bold': 700, 'extrabold': 800, 'black': 900
};

function getSortRank(name: string) {
  const parts = name.toLowerCase().split('-');
  const last = parts[parts.length - 1];
  if (SIZE_WEIGHTS[last] !== undefined) return { group: parts.slice(0, -1).join('-'), val: SIZE_WEIGHTS[last], type: 'size' as const };
  const n = parseFloat(last);
  if (!isNaN(n)) return { group: parts.slice(0, -1).join('-'), val: n, type: 'num' as const };
  if (SIZE_WEIGHTS[name] !== undefined) return { group: '', val: SIZE_WEIGHTS[name], type: 'size' as const };
  return { group: name, val: 0, type: 'other' as const };
}

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
  // Remove any leading dashes first to prevent triple dashes
  const clean = name.replace(/^-+/, "");
  const n = pfx ? `${pfx}-${clean}` : clean;
  return `--${n}`;
}

/**
 * Genera el nombre final del token a partir de una variable de Figma.
 */
function makeTokenName(v: Variable, collectionName: string, nameMode: NameMode): string {
  if (nameMode === "code-syntax") {
    if (v.codeSyntax && v.codeSyntax["WEB"]) {
      let cs = v.codeSyntax["WEB"];
      if (cs.startsWith("var(") && cs.endsWith(")")) {
        cs = cs.substring(4, cs.length - 1);
      }
      // Remove ALL leading dashes rigorously
      cs = cs.replace(/^-+/, "");
      return cs;
    }
    const joined = getCleanedPathSegments(v, collectionName).join('-');
    return kebab(joined || v.name || '');
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
    rootPerBlock: Record<string, FolderNode>, 
    blockMeta: Record<string, { collectionName: string; modeName: string; selector: string }>, 
    modesMap: Record<string, string[]>
) {
    const key = `${col.id}::${modeId}`;
    if (rootPerBlock[key]) return key;
    rootPerBlock[key] = createFolderNode();
    const modeName = col.modes.find(m => m.modeId === modeId)?.name || modeId;
    
    // Check if there are multiple modes IN THIS COLLECTION
    const collectionModeCount = modesMap[col.id]?.length || 0;
    const totalModesAcrossAll = Object.keys(modesMap).reduce((acc, current) => acc + modesMap[current].length, 0);

    // Provide a unique selector if there's any potential for collision
    let selector = ':root';
    if (collectionModeCount > 1 || totalModesAcrossAll > 1) {
      selector = `:root[data-theme="${kebab(modeName)}"]`;
      // If still too generic, add collection name
      if (Object.keys(modesMap).length > 1) {
         selector = `:root[data-theme="${kebab(col.name)}-${kebab(modeName)}"]`;
      }
    }

    blockMeta[key] = { collectionName: col.name, modeName, selector };
    return key;
}


/**
 * Convierte RGB [0,1] a HSL.
 */
function rgbToHsl(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

/**
 * Convierte RGB [0,1] a OKLCH.
 */
function rgbToOklch(r: number, g: number, b: number) {
  const lr = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  const lg = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  const lb = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_cube = Math.cbrt(l_);
  const m_cube = Math.cbrt(m);
  const s_cube = Math.cbrt(s_);

  const L = 0.2104542553 * l_cube + 0.7936177850 * m_cube - 0.0040720468 * s_cube;
  const a = 1.9779984951 * l_cube - 2.4285922050 * m_cube + 0.4505937099 * s_cube;
  const b_ = 0.0259040371 * l_cube + 0.7827717662 * m_cube - 0.8086757660 * s_cube;

  const C = Math.sqrt(a * a + b_ * b_);
  let hue = Math.atan2(b_, a) * (180 / Math.PI);
  if (hue < 0) hue += 360;

  return { l: L, c: C, h: hue };
}
