import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const require = createRequire(import.meta.url);

// The MIT section of FigUI3's split LICENSE, read from the installed version so it always matches the bundle
function figui3MitNotice() {
  // package.json isn't in the package's "exports"; resolve its main entry (dist/fig.js) and walk up
  const pkgDir = dirname(dirname(require.resolve("@rogieking/figui3")));
  const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const license = readFileSync(join(pkgDir, "LICENSE"), "utf8");
  const start = license.indexOf("MIT License");
  const sections = license.slice(start).split(/^={10,}$/m);
  // sections[0] = title line, sections[1] = MIT body
  const body = (sections[1] || "").trim();
  if (start < 0 || !body.includes("Permission is hereby granted")) {
    throw new Error("Could not find FigUI3's MIT notice in its LICENSE file");
  }
  return `@rogieking/figui3 ${version} (core, MIT)\n\n${body}`.replace(/--/g, "- -");
}

// Figma loads the UI as a single HTML string: everything (FigUI3 included) is inlined into dist/ui.html
export default defineConfig({
  root: "ui",
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  plugins: [
    viteSingleFile({ removeViteModuleLoader: true }),
    {
      name: "rename-to-ui-html",
      enforce: "post",
      generateBundle(_options, bundle) {
        const html = bundle["index.html"];
        if (!html) return;
        html.fileName = "ui.html";
        // Minification strips license comments, so keep the third-party notice at the top of the file
        // (placed after the doctype so the page never falls into quirks mode)
        const notice = `<!--\nThird-party software bundled in this file:\n\n${figui3MitNotice()}\n-->\n`;
        html.source = String(html.source).replace(/^(<!doctype html>\s*)/i, (doctype) => doctype + notice);
        if (!String(html.source).includes("Permission is hereby granted")) {
          throw new Error("dist/ui.html must start with <!doctype html> to embed the license notice");
        }
      },
    },
  ],
});
