/* eslint-env browser, node, es2020 */
// A small, realistic design system and a mocked `figma` global, so the real plugin (code.js + dist/ui.html)
// can run outside Figma for the store images. Used by harness.html (browser) and export-demo.js (node).
(function (root) {
  const rgb = (hex, a = 1) => {
    const n = parseInt(hex.slice(1), 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a };
  };
  const alias = (id) => ({ type: "VARIABLE_ALIAS", id });
  const V = (id, name, col, type, valuesByMode, web, scopes = ["ALL_SCOPES"]) =>
    ({ id, name, variableCollectionId: col, resolvedType: type, valuesByMode, codeSyntax: web ? { WEB: web } : {}, scopes });

  const collections = [
    { id: "C1", name: "Primitives", defaultModeId: "p", modes: [{ modeId: "p", name: "Value" }] },
    { id: "C2", name: "Theme", defaultModeId: "l",
      modes: [{ modeId: "l", name: "Light" }, { modeId: "d", name: "Dark" }, { modeId: "h", name: "High contrast" }] },
    { id: "C3", name: "Tokens", defaultModeId: "t", modes: [{ modeId: "t", name: "Value" }] },
  ];

  const P = (id, name, hex, a) => V(id, name, "C1", "COLOR", { p: rgb(hex, a) });
  const T = (id, name, l, d, h, web) => V(id, name, "C2", "COLOR", { l: alias(l), d: alias(d), h: alias(h) }, web);
  const N = (id, name, value, scopes) => V(id, name, "C3", "FLOAT", { t: value }, undefined, scopes);

  const variables = [
    P("white", "white", "#FFFFFF"),
    P("black", "black", "#000000"),
    P("g50", "gray/50", "#F5F5F7"),
    P("g500", "gray/500", "#6E6E73"),
    P("g400", "gray/400", "#98989D"),
    P("g800", "gray/800", "#2C2C2E"),
    P("g900", "gray/900", "#1D1D1F"),
    P("b400", "blue/400", "#409CFF"),
    P("b500", "blue/500", "#007AFF"),
    P("b700", "blue/700", "#0040DD"),
    P("scrim", "scrim", "#000000", 0.4),

    T("bg", "bg/surface", "white", "g900", "white", "var(--surface)"),
    T("bg2", "bg/raised", "g50", "g800", "white", "var(--surface-raised)"),
    T("tx", "text/primary", "g900", "g50", "black", "var(--text-primary)"),
    T("tx2", "text/secondary", "g500", "g400", "g900", "var(--text-secondary)"),
    T("ac", "accent", "b500", "b400", "b700", "var(--accent)"),

    N("s2", "spacing/2", 8),
    N("s4", "spacing/4", 16),
    N("r", "radius/card", 20),
    N("fs", "font/size/body", 17),
    N("fw", "font/weight/semibold", 600),
    V("ff", "font/family/sans", "C3", "STRING", { t: "Inter, system-ui, sans-serif" }),
  ];

  root.makeDemoFigma = function (post) {
    return {
      showUI() {},
      notify() {},
      ui: { onmessage: null, postMessage: post },
      variables: {
        getLocalVariableCollectionsAsync: async () => collections,
        getLocalVariablesAsync: async () => variables,
        getVariableByIdAsync: async (id) => variables.find((v) => v.id === id) || null,
      },
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
