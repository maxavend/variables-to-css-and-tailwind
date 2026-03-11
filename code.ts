// =================================================================
// code.ts (Final, Documentado y Optimizado)
// =================================================================

// Muestra la interfaz del plugin con el tamaño especificado
figma.showUI(__html__, { width: 820, height: 900 });

// --- TIPOS GLOBALES Y ESTRUCTURAS DE DATOS ---

type ExportFormat = "css" | "tailwind" | "excel";
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
    prefix?: string;
    modesByCollection?: Record<string, string>;
  };
}



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
  blur: Record<string, string>;
  opacity: Record<string, string>;
  boxShadow: Record<string, string>;
  strokeWidth: Record<string, string>;
  tokens?: Record<string, string>;
}

// Estructuras de datos para organizar las líneas de CSS antes de generarlas
type Line = { name: string; text: string; order?: number };
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
        selectedVars, allCollections, nameMode, prefix, unitPxForFloat, modesByCollection
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
  modesByCollection: Record<string, string>
}) {
  const { selectedVars, allCollections, nameMode, prefix, unitPxForFloat, modesByCollection } = options;

  const rootPerBlock: Record<string, FolderNode> = {};
  const blockMeta: Record<string, { collectionName: string; modeName: string; selector: string }> = {};
  const twData: TwData = {
    colors: {}, spacing: {}, borderRadius: {}, borderWidth: {}, fontSize: {},
    lineHeight: {}, letterSpacing: {}, fontWeight: {}, fontFamily: {},
    blur: {}, opacity: {}, boxShadow: {}, strokeWidth: {},
    tokens: {},
  };
  // Track which Figma collection each token name belongs to
  const twTokenCollectionMap: Record<string, string> = {};
  // Track the order collections appear
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
      
  const out = formatOutputLine({ v, resolvedValue, aliasSourceVar, allCollections, cssVarName, nameMode, prefix, unitPxForFloat });
  const cssLine = out.cssLine;
  let tailwindEntry = out.tailwindEntry;

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
            name: tokenName // Para usar el getSortRank si se quiere
        });
      }
      if (!tailwindEntry) tailwindEntry = `var(${cssVarName})`;
      twTokenCollectionMap[tokenName] = col.name;
      if (collectionOrder.indexOf(col.name) === -1) collectionOrder.push(col.name);
      assignToTailwindData(twData, category, subName, tokenName, tailwindEntry);
    }
  }

  const cssOutput = composeCssOutput(rootPerBlock, blockMeta, modesMap, allCollections);
  const tailwindOutput = composeTailwindOutput(twData, twTokenCollectionMap, collectionOrder);
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
  unitPxForFloat: boolean
}) {
  const { v, resolvedValue, aliasSourceVar, allCollections, cssVarName, nameMode, prefix, unitPxForFloat } = options;
  let cssLine: string | null = null;
  let tailwindEntry: string | null = null;
  let rawFigmaValue: string | null = null;

  // Helper: RGBA to HEX (6 or 8 digits)
  function rgbaToHex(rgba: RGBA): string {
    let hex = "#" + [rgba.r, rgba.g, rgba.b]
      .map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
    if (rgba.a < 1) {
      hex += Math.round(rgba.a * 255).toString(16).padStart(2, '0').toUpperCase();
    }
    return hex;
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
        const hex = rgbaToHex(rgba);
        rawFigmaValue = hex;
        cssLine = `${cssVarName}: ${hex};`;
        tailwindEntry = hex;
        break;
      }
      case "FLOAT": {
        const val = unitPxForFloat ? `${resolvedValue}px` : String(resolvedValue);
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
 * Asigna una entrada de Tailwind a la categoría correcta dentro del objeto `twData`.
 */
function assignToTailwindData(twData: TwData, category: CategoryKey, subName: string, tokenName: string, tailwindEntry: string) {
  // Use the last segment ONLY for color shade scale (e.g., "primary-500").
  // For all other maps, use the full token name to avoid collisions like "spacing-16" in multiple families.
  const scaleKey = tokenName.split('-').pop() || tokenName;
  const norm = tokenName.toLowerCase();

  if (category === 'Colors') {
    const family = tokenName.substring(0, tokenName.lastIndexOf('-')) || tokenName;
    if (!twData.colors[family]) twData.colors[family] = {};
    twData.colors[family][scaleKey] = tailwindEntry;
    return;
  }

  // Smart routing: detect by token name regardless of category
  if (norm.startsWith('blur')) {
    twData.blur[tokenName] = tailwindEntry;
    return;
  }
  if (norm.startsWith('opacity')) {
    twData.opacity[tokenName] = tailwindEntry;
    return;
  }
  if (norm.startsWith('shadow') || norm.startsWith('drop-shadow')) {
    twData.boxShadow[tokenName] = tailwindEntry;
    return;
  }
  if (norm.startsWith('stroke')) {
    twData.strokeWidth[tokenName] = tailwindEntry;
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
      // Font weights are unitless — strip "px" if present (e.g. "700px" → "700")
      const cleanVal = tailwindEntry.replace(/px$/, '');
      twData.fontWeight[tokenName] = cleanVal;
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

function renderExcelNode(node: ExcelFolderNode): string[] {
    const chunks: string[] = [];
    const lines = node.lines.slice().sort((a: ExcelLine, b: ExcelLine) => {
      const ra = getSortRank(a.name);
      const rb = getSortRank(b.name);
      if (ra.group === rb.group && ra.type !== 'other') return ra.val - rb.val;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });

    for (const l of lines) {
      chunks.push(`"${l.figmaPath}","${l.figmaValueString}","${l.codeSyntax}","${l.codeValue}"`);
    }

    const subNames = Object.keys(node.subFolders); 
    for (const name of subNames) {
      if (chunks.length > 0 && !chunks[chunks.length - 1].startsWith('\n')) chunks.push(`\n"${name}","","",""`);
      else chunks.push(`"${name}","","",""`);
      
      chunks.push(...renderExcelNode(node.subFolders[name]));
    }
    
    // Filter out trailing empty spaces if they occur inside recursive buildup
    while(chunks.length > 0 && chunks[chunks.length - 1] === "") chunks.pop();
    
    return chunks;
}

/**
 * Construye el string final de configuración de Tailwind.
 */
function composeTailwindOutput(
    twData: TwData,
    collectionMap: Record<string, string>,
    collectionOrder: string[]
): string {
    const sections: string[] = [];

    // Sort helper
    const sortFn = ([a]: [string, string], [b]: [string, string]) => {
        const ra = getSortRank(a);
        const rb = getSortRank(b);
        if (ra.group === rb.group && ra.type !== 'other') return ra.val - rb.val;
        return a.localeCompare(b, undefined, { numeric: true });
    };

    // Helper: get the collection a color family belongs to (use first shade's token name)
    function getFamilyCollection(family: string): string {
      // The token name in the collection map is the full token (e.g. "amber-50")
      // Find ANY token that starts with this family
      const firstShade = Object.keys(collectionMap).find(k => {
        const fam = k.substring(0, k.lastIndexOf('-')) || k;
        return fam === family;
      });
      return firstShade ? collectionMap[firstShade] : collectionOrder[0] || '';
    }

    // --- COLORS ---
    if (Object.keys(twData.colors).length > 0) {
      const allFamilies = Object.keys(twData.colors);
      
      // Group families by collection, preserving collection order
      const familiesByCollection: Record<string, string[]> = {};
      for (const fam of allFamilies) {
        const col = getFamilyCollection(fam);
        if (!familiesByCollection[col]) familiesByCollection[col] = [];
        familiesByCollection[col].push(fam);
      }

      const colorLines: string[] = [];
      for (const colName of collectionOrder) {
        const families = familiesByCollection[colName];
        if (!families || families.length === 0) continue;
        families.sort();
        
        if (colorLines.length > 0) {
          colorLines.push(`\n        // --- ${colName} ---\n`);
        }

        for (const family of families) {
          const shades = Object.keys(twData.colors[family]).sort((a,b) => {
            const na = Number(a); const nb = Number(b);
            const aIsNum = !Number.isNaN(na); const bIsNum = !Number.isNaN(nb);
            if (aIsNum && bIsNum) return na - nb;
            if (aIsNum && !bIsNum) return -1;
            if (!aIsNum && bIsNum) return 1;
            return a.localeCompare(b, undefined, { numeric: true });
          }).map(shade => `          "${shade}": "${twData.colors[family][shade]}"`);
          colorLines.push(`        "${family}": {\n${shades.join(',\n')}\n        }`);
        }
      }
      sections.push(`      colors: {\n${colorLines.join(',\n')}\n      }`);
    }

    // --- SIMPLE MAPS (spacing, borderRadius, blur, etc.) ---
    const simpleMaps: {[key: string]: Record<string, string>} = {
        spacing: twData.spacing,
        borderRadius: twData.borderRadius,
        borderWidth: twData.borderWidth,
        fontSize: twData.fontSize,
        lineHeight: twData.lineHeight,
        letterSpacing: twData.letterSpacing,
        fontWeight: twData.fontWeight,
        fontFamily: twData.fontFamily,
        blur: twData.blur,
        opacity: twData.opacity,
        boxShadow: twData.boxShadow,
        strokeWidth: twData.strokeWidth,
    };

    for (const key in simpleMaps) {
        if (Object.prototype.hasOwnProperty.call(simpleMaps, key)) {
            const data = simpleMaps[key];
            if (Object.keys(data).length > 0) {
                const allEntries = Object.keys(data).map(k => [k, data[k]] as [string, string]);
                
                // Group by collection, preserving collection order
                const byCollection: Record<string, [string, string][]> = {};
                for (const entry of allEntries) {
                  const col = collectionMap[entry[0]] || collectionOrder[0] || '';
                  if (!byCollection[col]) byCollection[col] = [];
                  byCollection[col].push(entry);
                }

                const allLines: string[] = [];
                for (const colName of collectionOrder) {
                  const entries = byCollection[colName];
                  if (!entries || entries.length === 0) continue;
                  entries.sort(sortFn);
                  
                  if (allLines.length > 0) {
                    allLines.push(`        // --- ${colName} ---`);
                  }
                  for (const [k, v] of entries) {
                    allLines.push(`        "${k}": "${v}"`);
                  }
                }
                sections.push(`      ${key}: {\n${allLines.join(',\n')}\n      }`);
            }
        }
    }

  // Ensure any leftover 'Other' tokens are included so nothing is dropped
  if (twData.tokens && Object.keys(twData.tokens).length > 0) {
    const tokenEntries = Object.keys(twData.tokens).sort((a,b) => a.localeCompare(b, undefined, { numeric: true })).map(k => `        "${k}": "${twData.tokens![k]}"`);
    sections.push(`      tokens: {\n${tokenEntries.join(',\n')}\n      }`);
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


// --- HELPERS Y UTILIDADES VARIAS ---
const SIZE_WEIGHTS: Record<string, number> = {
  'none': 0, '2xs': 5, 'xs': 10, 'sm': 20, 'base': 30, 'default': 31, 'normal': 32,
  'md': 40, 'lg': 50, 'xl': 60, '2xl': 70, '3xl': 80, '4xl': 90, '5xl': 100, '6xl': 110,
  '7xl': 120, '8xl': 130, '9xl': 140, 'full': 999
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
    
    const totalModes = Object.keys(modesMap).reduce((acc, current) => acc + modesMap[current].length, 0);

    const selector = totalModes > 1 ? `:root[data-theme="${kebab(modeName)}"]` : `:root`;
    blockMeta[key] = { collectionName: col.name, modeName, selector };
    return key;
}


