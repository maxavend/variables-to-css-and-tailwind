// =================================================================
// code.ts (Final, Documentado y Optimizado)
// =================================================================

// Muestra la interfaz del plugin con el tamaño especificado
figma.showUI(__html__, { width: 820, height: 900 });

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
type Line = { name: string; text: string; order?: number };
type Group = Record<string, Line[]>;
type Sub = { groups: Group };
type Bucket = { subs: Record<string, Sub> };
type CatsObj = Record<CategoryKey, Bucket>;


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

      const { css, tailwind } = await processAndGenerateCode({
        selectedVars, allCollections, nameMode, prefix, unitPxForFloat, modesByCollection
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
  nameMode: NameMode,
  prefix: string,
  unitPxForFloat: boolean,
  modesByCollection: Record<string, string>
}) {
  const { selectedVars, allCollections, nameMode, prefix, unitPxForFloat, modesByCollection } = options;

  const catsPerBlock: Record<string, CatsObj> = {};
  const blockMeta: Record<string, { collectionName: string; modeName: string; selector: string }> = {};
  const twData: TwData = {
    colors: {}, spacing: {}, borderRadius: {}, borderWidth: {}, fontSize: {},
  lineHeight: {}, letterSpacing: {}, fontWeight: {}, fontFamily: {},
  tokens: {},
  };
  
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
      const pathSegments = getCleanedPathSegments(v, col.name);
      const h3Group = chooseH3Group(category, subName, pathSegments);
      
      const blockKey = ensureBlock(col, mId, catsPerBlock, blockMeta, modesMap);
      const groupArray = getGroupArray(catsPerBlock[blockKey], category, subName, h3Group);
      
  const out = formatOutputLine({ v, resolvedValue, aliasSourceVar, allCollections, cssVarName, nameMode, prefix, unitPxForFloat });
  const cssLine = out.cssLine;
  let tailwindEntry = out.tailwindEntry;

      if (cssLine) {
        // Preserve original order by attaching an index. Use the index from selectedVars.
        const originalIndex = selectedVars.indexOf(v);
        (groupArray as Array<Line>).push({ name: tokenName, text: cssLine, order: originalIndex });
      }
      // Ensure we always create a tailwind mapping. Fallback to var(--name) when none provided.
      if (!tailwindEntry) tailwindEntry = `var(${cssVarName})`;
      assignToTailwindData(twData, category, subName, tokenName, tailwindEntry);
    }
  }

  const cssOutput = composeCssOutput(catsPerBlock, blockMeta, modesMap, allCollections);
  const tailwindOutput = composeTailwindOutput(twData);

  return { css: cssOutput, tailwind: tailwindOutput };
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
  const norm = whole.replace(/[\s_\-]/g, '').toLowerCase();

  // Typography family
  if (first === 'typography' || norm.includes('font') || norm.includes('text')) {
    if (norm.includes('size')) return { category: 'Typography', subName: 'Font-Size' };
    if (norm.includes('lineheight')) return { category: 'Typography', subName: 'Line Height' };
    if (norm.includes('letterspacing') || norm.includes('tracking')) return { category: 'Typography', subName: 'Letter-Spacing' };
    if (norm.includes('weight')) return { category: 'Typography', subName: 'Weight' };
    if (norm.includes('family')) return { category: 'Typography', subName: 'Family' };
    return { category: 'Typography', subName: 'General' };
  }

  // Spacing family (space, radius, border width)
  if (first === 'size' || first === 'spacing' || norm.includes('space') || norm.includes('spacing') || norm.includes('gap') || norm.includes('radius') || norm.includes('rounded')) {
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
  const norm = p.replace(/[\s_\-]/g, ""); // normalize camel/snake/kebab
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

function chooseH3Group(_category: CategoryKey, _subName: string, segments: string[]): string {
    if (segments.length <= 1) return "__root__";
    if (segments.length > 2) return segments[1];
    return "__root__";
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
        const channels = `${Math.round(rgba.r * 255)} ${Math.round(rgba.g * 255)} ${Math.round(rgba.b * 255)}`;
        cssLine = `${cssVarName}: ${channels};`;
        if (rgba.a < 1) cssLine += ` /* alpha: ${rgba.a.toFixed(2)} */`;
        tailwindEntry = (rgba.a < 1) ? `rgb(var(${cssVarName}) / <alpha-value>)` : `rgb(var(${cssVarName}))`;
        break;
      }
      case "FLOAT": {
        const val = unitPxForFloat ? `${resolvedValue}px` : String(resolvedValue);
        cssLine = `${cssVarName}: ${val};`;
        tailwindEntry = `var(${cssVarName})`;
        break;
      }
      case "STRING": {
        cssLine = `${cssVarName}: "${resolvedValue}";`;
        tailwindEntry = `var(${cssVarName})`;
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
 * Construye el string final de CSS a partir de los datos organizados.
 */
function composeCssOutput(
    catsPerBlock: Record<string, CatsObj>, 
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
        const cats = catsPerBlock[blockKey];
        if (!cats) continue;
        const meta = blockMeta[blockKey];

        cssChunks.push(`/* --- Collection: ${meta.collectionName} | Mode: ${meta.modeName} --- */`);
        cssChunks.push(`${meta.selector} {`);
        
    const categoryOrder: CategoryKey[] = ["Colors", "Spacing", "Typography", "Other"];
    for (const category of categoryOrder) {
      const bucket = cats[category];
      const subNames = Object.keys(bucket.subs).sort();
      if (!subNames.length) continue;

      cssChunks.push(`\n  /* ${category} */`);
      for (const subName of subNames) {
        cssChunks.push(`  /* ${subName} */`);
        const groups = bucket.subs[subName].groups;
        const groupNames = Object.keys(groups).sort();
        for (const groupName of groupNames) {
          if (groupName !== "__root__") cssChunks.push(`  /* ${groupName} */`);
          const groupLines = groups[groupName];

          // Helper: try parse numeric suffix (with small normalization for dashes)
          const parseSuffix = (s: string): number | null => {
            if (!s) return null;
            const raw = String(s).trim();
            const n = Number(raw);
            if (!Number.isNaN(n)) return n;
            // try replacing lone dashes with dots for patterns like '0-5' -> '0.5'
            if (/^\d+-\d+$/.test(raw)) {
              const alt = raw.replace('-', '.');
              const a = Number(alt);
              if (!Number.isNaN(a)) return a;
            }
            return null;
          };

          const numericCount = groupLines.reduce((acc: number, it: Line) => {
            const last = (it.name || '').split('-').pop() || '';
            return acc + (parseSuffix(last) !== null ? 1 : 0);
          }, 0);
          const totalCount = groupLines.length || 1;
          const numericRatio = numericCount / totalCount;
          const useNumeric = numericRatio >= 0.6; // threshold

          const lines = groupLines.slice().sort((a: Line, b: Line) => {
            if (!useNumeric) {
              // Respect Figma order when hybrid decides not to use numeric sorting
              const ao = (typeof a.order === 'number') ? a.order : Number.MAX_SAFE_INTEGER;
              const bo = (typeof b.order === 'number') ? b.order : Number.MAX_SAFE_INTEGER;
              if (ao !== bo) return ao - bo;
              return a.name.localeCompare(b.name, undefined, { numeric: true });
            }
            // When numeric sorting is active: prefer numeric suffix descending
            const aLast = (a.name || '').split('-').pop() || '';
            const bLast = (b.name || '').split('-').pop() || '';
            const aNum = parseSuffix(aLast);
            const bNum = parseSuffix(bLast);
            const aNumValid = aNum !== null;
            const bNumValid = bNum !== null;
            if (aNumValid && bNumValid) return (bNum as number) - (aNum as number);
            if (aNumValid && !bNumValid) return -1;
            if (bNumValid && !aNumValid) return 1;
            // fallback to name compare
            return a.name.localeCompare(b.name, undefined, { numeric: true });
          });

          lines.forEach((line: Line) => cssChunks.push(`    ${line.text}`));
        }
      }
    }
        cssChunks.push("}\n");
    }
    return cssChunks.join("\n");
}

/**
 * Construye el string final de configuración de Tailwind.
 */
function composeTailwindOutput(twData: TwData): string {
    const sections: string[] = [];
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
        sections.push(`      colors: {\n${colorFamilies.join(',\n')}\n      }`);
    }

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
        if (Object.prototype.hasOwnProperty.call(simpleMaps, key)) {
            const data = simpleMaps[key];
            if (Object.keys(data).length > 0) {
                const sortedEntries = Object.keys(data).map(k => [k, data[k]]).sort(([a], [b]) => (a as string).localeCompare(b as string, undefined, { numeric: true }));
                const lines = sortedEntries.map(([k, v]) => `        "${k}": "${v}"`);
                sections.push(`      ${key}: {\n${lines.join(',\n')}\n      }`);
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

/**
 * Genera el nombre final del token a partir de una variable de Figma.
 */
function makeTokenName(v: Variable, collectionName: string, nameMode: NameMode): string {
  if (nameMode === "code-syntax") {
    const meta = v as VariableWithCodeSyntax;
    // Try several possible metadata fields and ensure they're strings
    const candidates = [meta.codeSyntax, meta.code_syntax, meta.codeName, meta.nameForCode, meta.nameForCodeSyntax];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim().length > 0) {
        return kebab(c.replace(/^--+/, ""));
      }
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
    catsPerBlock: Record<string, CatsObj>, 
    blockMeta: Record<string, { collectionName: string; modeName: string; selector: string }>, 
    modesMap: Record<string, string[]>
) {
    const key = `${col.id}::${modeId}`;
    if (catsPerBlock[key]) return key;
    catsPerBlock[key] = { Colors: { subs: {} }, Spacing: { subs: {} }, Typography: { subs: {} }, Other: { subs: {} } };
    const modeName = col.modes.find(m => m.modeId === modeId)?.name || modeId;
    
    const totalModes = Object.keys(modesMap).reduce((acc, current) => acc + modesMap[current].length, 0);

    const selector = totalModes > 1 ? `:root[data-theme="${kebab(modeName)}"]` : `:root`;
    blockMeta[key] = { collectionName: col.name, modeName, selector };
    return key;
}

/**
 * Obtiene (o crea) el array donde se debe insertar una nueva línea de CSS.
 */
function getGroupArray(block: CatsObj, category: CategoryKey, subName: string, h3Group: string): {name: string, text: string}[] {
    const catBucket = block[category];
    const subBucket = catBucket.subs[subName] || (catBucket.subs[subName] = { groups: {} });
    const groupKey = h3Group || "__root__";
    return subBucket.groups[groupKey] || (subBucket.groups[groupKey] = []);
}
