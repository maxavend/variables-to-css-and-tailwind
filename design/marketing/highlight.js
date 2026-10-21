/* eslint-env browser */
// Tiny highlighter for the CSS / JS / HTML excerpts in the store images.
// Excerpts are real plugin output (out/demo.*), picked by line ranges with excerpt().
window.highlight = function (src) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rules = [
    [/\/\*[\s\S]*?\*\/|\/\/[^\n]*/y, "com"],
    [/"[^"\n]*"/y, "str"],
    [/--[\w-]+/y, "prop"],
    [/:root(\[data-theme="[\w-]+"\])?|\b(module|exports|theme|extend|colors|class)\b|<\/?[a-z][a-z0-9]*/y, "sel"],
    [/\b\d+(\.\d+)?(px)?\b/y, "num"],
  ];
  let out = "", i = 0;
  outer: while (i < src.length) {
    for (const [re, cls] of rules) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (m && m[0].length) { out += `<span class="${cls}">${esc(m[0])}</span>`; i += m[0].length; continue outer; }
    }
    out += esc(src[i]); i++;
  }
  return out;
};

// Fetches a demo output file and returns the lines between two markers (inclusive), verbatim.
window.excerpt = async function (file, startsWith, endsWith) {
  const lines = (await (await fetch(file)).text()).split("\n");
  const a = lines.findIndex((l) => l.startsWith(startsWith));
  const b = lines.findIndex((l, i) => i > a && l.startsWith(endsWith));
  return lines.slice(a, b + 1).join("\n");
};
