import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

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
        if (html) html.fileName = "ui.html";
      },
    },
  ],
});
