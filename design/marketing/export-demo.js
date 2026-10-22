/* eslint-env node, es2020 */
/* eslint-disable @typescript-eslint/no-var-requires -- plain CommonJS script run with node */
// Runs the real code.js against the demo design system and writes its CSS and Tailwind output,
// so the store images show genuine plugin output. Run `npm run build:code` first.
// Usage: node design/marketing/export-demo.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
require("./demo-figma.js");

const root = path.join(__dirname, "..", "..");
const src = fs.readFileSync(path.join(root, "code.js"), "utf8");

async function run(payload) {
  const posted = [];
  const figma = globalThis.makeDemoFigma((m) => posted.push(m));
  vm.runInContext(src, vm.createContext({ figma, __html__: "", console }));
  await figma.ui.onmessage({ type: "RUN", payload: { nameMode: "code-syntax", unitPxForFloat: true, prefix: "", ...payload } });
  const res = posted.find((p) => p.type === "RESULT");
  if (!res) throw new Error("no RESULT: " + JSON.stringify(posted));
  return res.payload;
}

(async () => {
  const out = path.join(__dirname, "out");
  fs.mkdirSync(out, { recursive: true });
  const main = await run({});
  fs.writeFileSync(path.join(out, "demo.css"), main.css);
  fs.writeFileSync(path.join(out, "demo.tailwind.js"), main.tailwind);
  // variants for the naming slide
  fs.writeFileSync(path.join(out, "demo-figma-names.css"), (await run({ nameMode: "figma-name" })).css);
  fs.writeFileSync(path.join(out, "demo-prefix.css"), (await run({ prefix: "ds" })).css);
  // only the Light and Dark modes of Theme, for the selection slide
  const sel = await run({ collectionIds: ["C1", "C2", "C3"], modesByCollection: { C2: "l,d" } });
  fs.writeFileSync(path.join(out, "demo-selection.css"), sel.css);
  console.log("wrote demo outputs to out/");
})();
