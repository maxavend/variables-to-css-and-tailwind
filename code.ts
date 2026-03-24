/// <reference types="@figma/plugin-typings" />
// @ts-ignore
declare const __html__: string;

// Shows the plugin UI with the specified size
figma.showUI(__html__, { width: 900, height: 600 });

// --- GLOBAL TYPES AND DATA STRUCTURES ---

type ExportFormat = "css";
type NameMode = "code-syntax" | "figma-name";
type CategoryKey = "Colors" | "Spacing" | "Typography" | "Other";

// Define the message structure sent from UI to plugin
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

// Extends the `Variable` type to include potential custom code syntax fields
type VariableWithCodeSyntax = Variable & Partial<{
  codeSyntax: string;
  code_syntax: string;
  codeName: string;
  nameForCode: string;
  nameForCodeSyntax: string;
}>;

// Data structures to organize CSS lines with Double-Nested Grouping (Root > Subfolder)
type BlockData = { 
  rootOrder: string[], 
  subFolderOrder: Map<string, string[]>, 
  cssLinesByFolder: Map<string, string[]> 
}; 
type BlockMap = Map<string, BlockData>; // BlockKey -> BlockData (Mode/Collection)


// --- MESSAGE HANDLING FROM UI (ENTRY POINT) ---

/**
 * Listens for and processes messages coming from the UI (ui.html).
 * This is the main controller of the plugin.
 */
figma.ui.onmessage = async (msg: UIRequest) => {
  // 1. 'INIT' message: Received when the plugin loads.
  // Purpose is to get initial data (collections, variables) and send them to the UI.
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
      console.error("Error in INIT:", e);
      figma.notify("Error loading collections.", { error: true });
    }
    return;
  }

  // 2. 'RUN' message: Received when the user clicks "Generate".
  // Triggers the main logic to process variables and generate code.
  if (msg.type === "RUN") {
    try {
      const {
        collectionIds = [],
        nameMode = "code-syntax",
        format = ["css"],
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

      const { css } = await processAndGenerateCode({
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
          css: css
        }
      });

    } catch (e) {
      console.error("Error in RUN:", e);
      figma.notify("An error occurred while generating the code. Check the console.", { error: true });
    }
  }
};


// --- MAIN PROCESSING LOGIC ---

/**
 * Orchestrates the entire code generation process.
 * Iterates over selected variables and organizes the output.
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
  
  const modesMap: Record<string, string[]> = {};
  for (const c of allCollections) {
    if (selectedCollectionIds.has(c.id)) {
      modesMap[c.id] = resolveModesForCollection(c, modesByCollection[c.id]);
    }
  }

  // Iterate collection-by-collection in Figma's original order
  for (const col of allCollections) {
    if (!selectedCollectionIds.has(col.id)) continue;
    const modeIds = modesMap[col.id] || [];

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


        const tokenName = makeTokenName(v, col.name, nameMode);
        const cssVarName = toCssVar(tokenName, prefix).replace(/\n/g, "").trim();
        
        const blockKey = ensureBlock(col, mId, catsPerBlock, blockMeta, modesMap);
        const block = catsPerBlock.get(blockKey)!;

        // 1. Path Identification (Root and Sub-folder)
        const nameParts = v.name.split('/').map(s => s.trim()).filter(Boolean);
        const rootCategory = nameParts.length > 0 ? nameParts[0] : "Root";
        const folderPath = nameParts.length > 1 ? nameParts.slice(0, -1).join(' / ') : "Root";

        const out = formatOutputLine({ v, resolvedValue, aliasSourceVar, allCollections, cssVarName, nameMode, prefix, unitPxForFloat, unitMode, colorFormat, baseSize });
        
        if (out.cssLine) {
          const cleanLine = out.cssLine.replace(/\n/g, "").trim();
          
          // A. Register Root Category if new
          if (!block.rootOrder.includes(rootCategory)) {
            block.rootOrder.push(rootCategory);
            block.subFolderOrder.set(rootCategory, []);
          }
          
          // B. Register Sub-folder within its Root Category if new
          const folderList = block.subFolderOrder.get(rootCategory)!;
          if (!folderList.includes(folderPath)) {
            folderList.push(folderPath);
          }

          // C. Save CSS line in its exact folder (Nested Grouping)
          if (!block.cssLinesByFolder.has(folderPath)) {
            block.cssLinesByFolder.set(folderPath, []);
          }
          block.cssLinesByFolder.get(folderPath)!.push(cleanLine);
        }
      }
    }
  }

  const cssOutput = composeCssOutput(catsPerBlock, blockMeta, modesMap, allCollections);

  return { css: cssOutput };
}


// --- FORMAT AND COMPOSITION HELPERS ---

/**
 * Formats a single CSS line from a variable.
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
  
  if (aliasSourceVar) {
    const srcCol = allCollections.find(c => c.id === aliasSourceVar.variableCollectionId)!;
    const srcTokenName = makeTokenName(aliasSourceVar, srcCol.name, nameMode);
    const srcCssVarName = toCssVar(srcTokenName, prefix);
    cssLine = `${cssVarName}: var(${srcCssVarName});`;
  } else {
    switch (v.resolvedType) {
      case "COLOR": {
        const rgba = resolvedValue as RGBA;
        let colorVal = "";
        
        const r = Math.round(rgba.r * 255);
        const g = Math.round(rgba.g * 255);
        const b = Math.round(rgba.b * 255);

        if (colorFormat === "hex") {
          colorVal = toHex(rgba);
        } else if (colorFormat === "oklch") {
          colorVal = toOKLCH(rgba);
        } else {
          // Default: RGB Wrapped for Tailwind V4
          if (rgba.a < 1) {
            colorVal = `rgb(${r} ${g} ${b} / ${rgba.a.toFixed(2)})`;
          } else {
            colorVal = `rgb(${r} ${g} ${b})`;
          }
        }

        cssLine = `${cssVarName}: ${colorVal};`;
        if (rgba.a < 1 && colorFormat !== "oklch" && colorFormat !== "hex") {
           cssLine += ` /* alpha: ${rgba.a.toFixed(2)} */`;
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
        break;
      }
      case "STRING": {
        const val = String(resolvedValue);
        const isFont = v.name.toLowerCase().includes('font') || v.name.toLowerCase().includes('family');
        
        if (isFont) {
          cssLine = `${cssVarName}: "${val}", sans-serif;`;
        } else {
          cssLine = `${cssVarName}: "${val}";`;
        }
        break;
      }
    }
  }
  return { cssLine };
}

/**
 * Composes the final CSS block by iterating through a double-nested flow
 * to avoid fragmentation and ensure absolute cohesion.
 */
function composeCssOutput(
    catsPerBlock: BlockMap, 
    blockMeta: Record<string, { collectionName: string; modeName: string; selector: string }>, 
    modesMap: Record<string, string[]>, 
    allCollections: VariableCollection[]
): string {
    const cssChunks: string[] = [];
    
    for (const [blockKey, data] of catsPerBlock.entries()) {
        const meta = blockMeta[blockKey];
        if (data.rootOrder.length === 0) continue;

        cssChunks.push(`/* --- Collection: ${meta.collectionName} | Mode: ${meta.modeName} --- */\n`);
        cssChunks.push(`${meta.selector} {`);
        
        // 1. Iterate by Root Category (Color, Spacing, etc)
        data.rootOrder.forEach(rootCat => {
            const folders = data.subFolderOrder.get(rootCat) || [];
            
            // 2. Iterate by Sub-folder within each Category
            folders.forEach(folderPath => {
                const lines = data.cssLinesByFolder.get(folderPath) || [];
                if (lines.length === 0) return;

                cssChunks.push(`\n  /* --- ${folderPath} --- */`);
                lines.forEach(line => {
                    cssChunks.push(`  ${line}`);
                });
            });
        });

        cssChunks.push("}\n");
    }
    return cssChunks.join("\n");
}


// --- VARIOUS HELPERS AND UTILITIES ---

/**
 * Generates the token name strictly respecting Figma's Code Syntax (WEB/iOS/Android)
 * or using an intelligent fallback from path segments.
 */
function makeTokenName(v: Variable, collectionName: string, nameMode: NameMode): string {
  // 1. CODE SYNTAX MODE: Absolute priority to Figma's official field
  if (nameMode === "code-syntax") {
    const rawSyntax = v.codeSyntax;
    if (rawSyntax && typeof rawSyntax === 'object') {
      // We prioritize WEB, but accept any platform if it has content
      const platforms = ["WEB", "ANDROID", "iOS"] as const;
      for (const p of platforms) {
        const val = (rawSyntax as any)[p];
        if (typeof val === 'string' && val.trim().length > 0) {
          return val.trim().replace(/^--+/, "");
        }
      }
    }

    // Fallbacks for old properties or metadata from other plugins
    const meta = v as any;
    const candidates = [meta.code_syntax, meta.codeName, meta.nameForCode, meta.nameForCodeSyntax];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim().length > 0) {
        return c.trim().replace(/^--+/, "");
      }
    }
  }

  // 2. LAYER NAME / FALLBACK MODE: Use Figma's path (Absolute Literal)
  const parts = (v.name || '').split('/').map(s => s.trim()).filter(Boolean);
  
  // Use the full path joined by hyphens (no filters to avoid context loss)
  return kebab(parts.join('-'));
}

/**
 * Converts a token name into a CSS variable (--name).
 * Ensures the -- prefix and handles the optional UI prefix.
 */
function toCssVar(name: string, prefix: string): string {
  const n = prefix ? `${prefix}-${name}` : name;
  // Only add -- at the beginning and clean duplicates
  return `--${n.replace(/^--+/, "")}`;
}

/**
 * Converts a string or mixed value to kebab-case safe for CSS.
 */
function kebab(s: unknown): string {
  const str = String(s || '').trim();
  if (!str) return '';
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[/\s_]+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .replace(/--+/g, "-")
    .toLowerCase();
}

function toHex(rgba: RGBA): string {
  const r = Math.round(rgba.r * 255).toString(16).padStart(2, "0");
  const g = Math.round(rgba.g * 255).toString(16).padStart(2, "0");
  const b = Math.round(rgba.b * 255).toString(16).padStart(2, "0");
  const a = rgba.a < 1 ? Math.round(rgba.a * 255).toString(16).padStart(2, "0") : "";
  return `#${r}${g}${b}${a}`;
}

/**
 * Converts RGB to OKLCH (Simplified for CSS)
 * L: 0-1, C: 0-0.4, H: 0-360
 */
function toOKLCH(rgba: RGBA): string {
  // Simplified direct oklch conversion from RGB
  // For absolute precision, a transformation matrix to XYZ would be required
  // but for CSS this format is sufficient with base values.
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
 * Resolves which modes should be processed for a collection.
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
 * Finds the first mode of a variable that has a defined value.
 */
function findFirstDefinedModeId(v: Variable, col: VariableCollection): string | null {
  for (const mode of col.modes) {
    if (v.valuesByMode[mode.modeId] !== undefined) return mode.modeId;
  }
  return null;
}

/**
 * Recursively resolves an alias variable until a concrete value is found.
 * Includes a safeguard to prevent infinite loops.
 */
async function resolveAlias(options: { rawValue: VariableValue, modeId: string, allCollections: VariableCollection[], depth?: number }): Promise<{ value: VariableValue, sourceVar?: Variable }> {
  const { rawValue, modeId, allCollections, depth = 0 } = options;
  
  // Safeguard against infinite alias loops
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

  catsPerBlock.set(key, { 
    rootOrder: [], 
    subFolderOrder: new Map(), 
    cssLinesByFolder: new Map() 
  });
  
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
