// Pruebas de la lógica del plugin: ejecuta code.js (npm run build:code) contra un API de Figma simulado.
// Uso: npm test
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'code.js'), 'utf8');
const rgb = (hex, a = 1) => { const n = parseInt(hex.slice(1), 16); return { r: (n >> 16 & 255) / 255, g: (n >> 8 & 255) / 255, b: (n & 255) / 255, a }; };
const alias = id => ({ type: 'VARIABLE_ALIAS', id });
const collections = [
  { id: 'C1', name: 'Primitives', defaultModeId: 'p1', modes: [{ modeId: 'p1', name: 'Mode 1' }] },
  { id: 'C2', name: 'Semantic', defaultModeId: 'l', modes: [{ modeId: 'l', name: 'Light' }, { modeId: 'd', name: 'Dark' }] },
  { id: 'C3', name: 'Tokens', defaultModeId: 't1', modes: [{ modeId: 't1', name: 'Mode 1' }] },
];
const V = (id, name, col, type, valuesByMode, codeSyntax = {}, scopes = ['ALL_SCOPES']) => ({ id, name, variableCollectionId: col, resolvedType: type, valuesByMode, codeSyntax, scopes });
const variables = [
  V('v1', 'blue/500', 'C1', 'COLOR', { p1: rgb('#1f7ae0') }, { WEB: 'var(--brand-blue-500)' }),
  V('v2', 'blue/300', 'C1', 'COLOR', { p1: rgb('#7ab3f0') }),
  V('v3', 'white', 'C1', 'COLOR', { p1: rgb('#ffffff') }),
  V('v4', 'overlay', 'C1', 'COLOR', { p1: rgb('#000000', 0.5) }),
  V('v5', 'text/primary', 'C2', 'COLOR', { l: alias('v1'), d: alias('v2') }),
  V('v6', 'bg/surface', 'C2', 'COLOR', { l: alias('v3'), d: alias('v1') }),
  V('v6b', 'bg/scrim', 'C2', 'COLOR', { l: alias('v3'), d: alias('v4') }),
  V('v7', 'spacing/0.5', 'C3', 'FLOAT', { t1: 2 }),
  V('v8', 'spacing/05', 'C3', 'FLOAT', { t1: 20 }),
  V('v9', 'font/weight/bold', 'C3', 'FLOAT', { t1: 700 }),
  V('v9b', 'font/line-height/body', 'C3', 'FLOAT', { t1: 1.2000000476837158 }),
  V('v9c', 'font/line-height/heading', 'C3', 'FLOAT', { t1: 32 }),
  V('v9d', 'disabled', 'C3', 'FLOAT', { t1: 40 }, {}, ['OPACITY']),
  V('v10', 'font/family/base', 'C3', 'STRING', { t1: 'SF Pro Text, sans-serif' }),
  V('v11', 'radius/md', 'C3', 'FLOAT', { t1: 8 }),
  V('v12', 'tamaño/pequeño', 'C3', 'FLOAT', { t1: 12 }),
  V('v13', 'is-visible', 'C3', 'BOOLEAN', { t1: true }),
  V('v14', 'brand/remote', 'C3', 'COLOR', { t1: alias('REMOTE') }),
  V('v15', 'broken', 'C3', 'COLOR', { t1: alias('MISSING') }),
];
const remote = V('REMOTE', 'lib/red', 'LIBCOL', 'COLOR', { lm: rgb('#ff0000') });

async function run(payload) {
  const posted = [], notified = [];
  const figma = {
    showUI() {}, notify(m) { notified.push(m); },
    ui: { onmessage: null, postMessage(m) { posted.push(m); } },
    variables: {
      getLocalVariableCollectionsAsync: async () => collections,
      getLocalVariablesAsync: async () => variables,
      getVariableByIdAsync: async id => id === 'REMOTE' ? remote : variables.find(v => v.id === id) || null,
    },
  };
  const ctx = { figma, __html__: '', console: { error: (...a) => notified.push('console.error ' + a.join(' ')), warn() {}, log() {} } };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  await figma.ui.onmessage({ type: 'RUN', payload });
  const res = posted.find(p => p.type === 'RESULT');
  return { css: res ? res.payload.css : null, tw: res ? res.payload.tailwind : null, notified };
}

async function make(fail) {
  const posted = []; let showUIOpts;
  const figma = {
    showUI(_h, o) { showUIOpts = o; }, notify() {},
    ui: { onmessage: null, postMessage(m) { posted.push(m); } },
    variables: {
      getLocalVariableCollectionsAsync: async () => { if (fail) throw new Error('boom'); return [{ id: 'C', name: 'C', defaultModeId: 'm', modes: [{ modeId: 'm', name: 'Mode 1' }] }]; },
      getLocalVariablesAsync: async () => [],
      getVariableByIdAsync: async () => null,
    },
  };
  vm.runInContext(src, vm.createContext({ figma, __html__: '', console: { error() {}, warn() {}, log() {} } }));
  return { figma, posted, opts: () => showUIOpts };
}

let fails = 0;
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) fails++; };
// Extract the body of the CSS block for a given selector
const block = (css, sel) => { const i = css.indexOf(sel + ' {'); return i < 0 ? '' : css.slice(i, css.indexOf('}', i)); };

(async () => {
  const all = await run({});
  const { css, tw } = all;

  console.log('\n# 1 Alias remotos / no exportados');
  check('No se cae con alias a librería remota', css !== null);
  check('Alias remoto se escribe con su valor literal', /--brand-remote: 255 0 0; \/\* alias: lib\/red \*\//.test(css));
  check('Alias roto se omite y se avisa', !css.includes('--broken') && all.notified.some(n => n.includes('broken')));
  const onlySem = await run({ collectionIds: ['C2'] });
  check('Exportando solo Semantic no quedan var() colgando', !/var\(--(brand-blue|white|blue|overlay)/.test(onlySem.css) && onlySem.css.includes('--text-primary: 31 122 224;'));

  console.log('\n# 2 Selectores');
  check('Primitives (1 modo) va en :root', /Collection: Primitives \| Mode: Mode 1 --- \*\/\n:root \{/.test(css));
  check('Modo por defecto (Light) en ":root, [data-theme=light]"', css.includes(':root, :root[data-theme="light"] {'));
  check('Dark en :root[data-theme="dark"]', css.includes(':root[data-theme="dark"] {'));
  check('Nunca aparece data-theme="mode-1"', !css.includes('mode-1'));

  console.log('\n# 3 Code Syntax WEB');
  check('Usa codeSyntax.WEB (--brand-blue-500)', css.includes('--brand-blue-500: 31 122 224;'));
  check('Alias semántico apunta al nombre de Code Syntax', block(css, ':root, :root[data-theme="light"]').includes('--text-primary: var(--brand-blue-500);'));
  const fig = await run({ nameMode: 'figma-name' });
  check('Modo "Figma Names" ignora Code Syntax', fig.css.includes('--blue-500: 31 122 224;'));

  console.log('\n# 4 Clasificación de colores "text/..."');
  check('text-primary queda en Colors, no en Typography', /\/\* Colors \*\/[\s\S]*--text-primary[\s\S]*\/\* Typography \*\//.test(block(css, ':root[data-theme="dark"]') + '/* Typography */'));
  check('text-primary está en colors de Tailwind', /"text": \{\s*"primary": "rgb\(var\(--text-primary\) \/ <alpha-value>\)"/.test(tw));
  check('Tailwind no tiene "tokens" con colores', !/"text-primary"/.test(tw));

  console.log('\n# 5 Temas en Tailwind');
  check('Tailwind usa la variable semántica (no el primitivo)', tw.includes('rgb(var(--bg-surface) / <alpha-value>)'));

  console.log('\n# 6 Alfa');
  check('CSS conserva alfa en el valor', css.includes('--overlay: 0 0 0 / 0.5;'));
  check('Color translúcido sin <alpha-value>', tw.includes('"overlay": "rgb(var(--overlay))"'));
  check('Color opaco con <alpha-value>', tw.includes('rgb(var(--brand-blue-500) / <alpha-value>)'));
  check('Alias translúcido en algún modo (scrim) sin <alpha-value>', /"scrim": "rgb\(var\(--bg-scrim\)\)"/.test(tw));

  console.log('\n# 7 Unidades');
  check('font-weight sin px', css.includes('--font-weight-bold: 700;'));
  check('line-height multiplicador sin px y redondeado', css.includes('--font-line-height-body: 1.2;'));
  check('line-height en px se mantiene', css.includes('--font-line-height-heading: 32px;'));
  check('Opacidad 40 -> 0.4', css.includes('--disabled: 0.4;'));
  check('Spacing conserva px', css.includes('--radius-md: 8px;'));
  check('Font stack correcto', css.includes('--font-family-base: "SF Pro Text", sans-serif;'));

  console.log('\n# 8 Nombres');
  check('spacing/0.5 -> spacing-0_5', css.includes('--spacing-0_5: 2px;'));
  check('spacing/05 sigue siendo distinto', css.includes('--spacing-05: 20px;'));
  check('tamaño/pequeño -> tamano-pequeno', css.includes('--tamano-pequeno: 12px;'));

  console.log('\n# 9 Colores sin escala');
  check('white -> "white": string (bg-white)', tw.includes('"white": "rgb(var(--white) / <alpha-value>)"') && !tw.includes('"white": {'));

  console.log('\n# Extra');
  check('BOOLEAN no genera var() colgando en Tailwind', !tw.includes('is-visible'));

  console.log('\n# Contrato de mensajes');
  const ok = await make(false);
  check('showUI con themeColors y 320px', ok.opts().themeColors === true && ok.opts().width === 320);
  await ok.figma.ui.onmessage({ type: 'INIT' });
  check('INIT responde INIT_DATA', ok.posted.at(-1).type === 'INIT_DATA' && ok.posted.at(-1).payload[0].modes.length === 1);
  await ok.figma.ui.onmessage({ type: 'RUN', payload: { collectionIds: ['C'] } });
  check('RUN responde RESULT', ok.posted.at(-1).type === 'RESULT');
  const bad = await make(true);
  await bad.figma.ui.onmessage({ type: 'INIT' });
  check('INIT con error responde ERROR {request: INIT}', JSON.stringify(bad.posted.at(-1)) === JSON.stringify({ type: 'ERROR', payload: { request: 'INIT', message: 'boom' } }));
  await bad.figma.ui.onmessage({ type: 'RUN', payload: {} });
  check('RUN con error responde ERROR {request: RUN}', bad.posted.at(-1).type === 'ERROR' && bad.posted.at(-1).payload.request === 'RUN');
  const n = bad.posted.length; await bad.figma.ui.onmessage({ type: 'NOPE' });
  check('Mensaje desconocido no rompe nada', bad.posted.length === n);
  console.log(`\n${fails ? fails + ' FALLAS' : 'TODO OK'}`);
  process.exit(fails ? 1 : 0);
})();
